#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import psycopg
from psycopg.types.json import Jsonb


@dataclass(frozen=True)
class City:
    slug: str
    label: str
    bbox: str


CITIES = {
    "spb": City("spb", "Санкт-Петербург", "29.42,59.63,30.76,60.25"),
    "moscow": City("moscow", "Москва", "36.80,55.14,37.97,56.02"),
}

CATEGORY_LABELS = {
    "restaurant": "Ресторан",
    "coffee": "Кофейня",
    "bar": "Бар",
    "hotel": "Отель",
    "culture": "Культура",
    "entertainment": "Развлечения",
    "shop": "Магазин",
    "park": "Место",
}

UPSERT_SQL = """
WITH category AS (
    SELECT id
    FROM categories
    WHERE slug = %(category)s
    LIMIT 1
), city AS (
    SELECT id
    FROM cities
    WHERE slug = %(city)s
    LIMIT 1
)
INSERT INTO places (
    public_id,
    city_id,
    category_id,
    name,
    normalized_name,
    latitude,
    longitude,
    address,
    phone,
    website,
    attributes,
    provider_data,
    is_active,
    updated_at
)
SELECT
    %(public_id)s,
    city.id,
    category.id,
    %(name)s,
    lower(trim(%(name)s)),
    %(lat)s,
    %(lng)s,
    NULLIF(trim(%(address)s), ''),
    NULLIF(trim(%(phone)s), ''),
    NULLIF(trim(%(website)s), ''),
    %(attributes)s,
    %(provider_data)s,
    true,
    now()
FROM city
LEFT JOIN category ON true
ON CONFLICT (public_id) DO UPDATE
SET city_id = EXCLUDED.city_id,
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    normalized_name = EXCLUDED.normalized_name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    address = COALESCE(EXCLUDED.address, places.address),
    phone = COALESCE(EXCLUDED.phone, places.phone),
    website = COALESCE(EXCLUDED.website, places.website),
    attributes = places.attributes || EXCLUDED.attributes,
    provider_data = places.provider_data || EXCLUDED.provider_data,
    is_active = true,
    updated_at = now()
"""


def as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else [value]
        except json.JSONDecodeError:
            return [value]
    return []


def first_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    for item in as_list(value):
        if isinstance(item, str) and item.strip():
            return item.strip()
    return ""


def place_name(props: dict[str, Any]) -> str:
    names = as_dict(props.get("names"))
    primary = names.get("primary")
    if isinstance(primary, str) and primary.strip():
        return primary.strip()

    common = names.get("common")
    if isinstance(common, dict):
        for key in ("ru", "local", "en"):
            value = common.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for value in common.values():
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def taxonomy_values(props: dict[str, Any]) -> tuple[str, list[str]]:
    taxonomy = as_dict(props.get("taxonomy"))
    primary = str(taxonomy.get("primary") or "").strip().lower()
    hierarchy = [str(item).strip().lower() for item in as_list(taxonomy.get("hierarchy")) if str(item).strip()]
    basic = str(props.get("basic_category") or "").strip().lower()
    values = [value for value in [basic, primary, *hierarchy] if value]
    return primary or basic, values


def classify(props: dict[str, Any]) -> tuple[str, str] | None:
    _, values = taxonomy_values(props)
    if not values:
        return None

    joined = " ".join(values)

    def has(*needles: str) -> bool:
        return any(needle in joined for needle in needles)

    if has("coffee_shop", "coffeehouse", "coffee_roaster", "coffee"):
        return "coffee", CATEGORY_LABELS["coffee"]

    if has(
        "bar", "pub", "wine_bar", "cocktail", "beer_garden", "brewery",
        "taproom", "nightclub"
    ):
        return "bar", CATEGORY_LABELS["bar"]

    if has("hotel", "hostel", "motel", "lodging", "guest_house", "bed_and_breakfast", "resort"):
        return "hotel", CATEGORY_LABELS["hotel"]

    if has(
        "museum", "art_gallery", "gallery", "theater", "theatre", "opera",
        "concert_hall", "library", "cultural", "historic_site", "monument",
        "memorial"
    ):
        return "culture", CATEGORY_LABELS["culture"]

    if has(
        "cinema", "movie_theater", "bowling", "escape_room", "amusement",
        "arcade", "karaoke", "entertainment", "zoo", "aquarium", "water_park",
        "theme_park", "sports_center", "fitness_center", "spa"
    ):
        return "entertainment", CATEGORY_LABELS["entertainment"]

    if has(
        "shop", "store", "retail", "shopping", "market", "supermarket", "mall",
        "boutique", "bookstore", "clothing", "jewelry", "electronics", "florist"
    ):
        return "shop", CATEGORY_LABELS["shop"]

    if has(
        "park", "garden", "viewpoint", "observation_deck", "landmark", "attraction",
        "tourist_attraction", "natural", "beach", "square", "plaza", "promenade"
    ):
        return "park", CATEGORY_LABELS["park"]

    if has(
        "restaurant", "food_and_drink", "casual_eatery", "fast_food", "bakery",
        "pastry", "dessert", "ice_cream", "pizzeria", "food_court", "deli",
        "cafe", "tearoom", "tea_house"
    ):
        return "restaurant", CATEGORY_LABELS["restaurant"]

    return None


def address_text(props: dict[str, Any]) -> str:
    addresses = as_list(props.get("addresses"))
    for raw in addresses:
        address = as_dict(raw)
        freeform = str(address.get("freeform") or "").strip()
        if freeform:
            return freeform

        parts = [
            str(address.get("locality") or "").strip(),
            str(address.get("region") or "").strip(),
            str(address.get("postcode") or "").strip(),
        ]
        joined = ", ".join(part for part in parts if part)
        if joined:
            return joined
    return ""


def source_summary(props: dict[str, Any]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for raw in as_list(props.get("sources")):
        source = as_dict(raw)
        dataset = str(source.get("dataset") or source.get("provider") or "").strip()
        license_name = str(source.get("license") or "").strip()
        key = (dataset, license_name)
        if not dataset or key in seen:
            continue
        seen.add(key)
        result.append({"dataset": dataset, "license": license_name})
    return result


def normalize_feature(feature: dict[str, Any], city: City, min_confidence: float) -> dict[str, Any] | None:
    props = as_dict(feature.get("properties"))
    geometry = as_dict(feature.get("geometry"))
    coords = geometry.get("coordinates")
    if geometry.get("type") != "Point" or not isinstance(coords, list) or len(coords) < 2:
        return None

    try:
        lng = float(coords[0])
        lat = float(coords[1])
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None

    overture_id = str(props.get("id") or feature.get("id") or "").strip()
    name = place_name(props)
    if not overture_id or not name:
        return None

    status = str(props.get("operating_status") or "").lower()
    if "permanent" in status and "closed" in status:
        return None

    try:
        confidence = float(props.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0
    if confidence and confidence < min_confidence:
        return None

    category = classify(props)
    if category is None:
        return None
    category_slug, category_label = category

    taxonomy_primary, taxonomy_hierarchy = taxonomy_values(props)
    websites = [str(item).strip() for item in as_list(props.get("websites")) if str(item).strip()]
    socials = [str(item).strip() for item in as_list(props.get("socials")) if str(item).strip()]
    emails = [str(item).strip() for item in as_list(props.get("emails")) if str(item).strip()]
    phones = [str(item).strip() for item in as_list(props.get("phones")) if str(item).strip()]

    attributes = {
        "catalog_source": "overture",
        "basic_category": str(props.get("basic_category") or "").strip(),
        "taxonomy_primary": taxonomy_primary,
        "taxonomy_hierarchy": taxonomy_hierarchy,
        "socials": socials[:6],
        "emails": emails[:4],
    }
    provider_data = {
        "source": "overture",
        "overture_id": overture_id,
        "confidence": confidence,
        "operating_status": status,
        "sources": source_summary(props),
        "release": "latest",
    }

    return {
        "public_id": "ov_" + overture_id,
        "city": city.slug,
        "category": category_slug,
        "category_label": category_label,
        "name": name,
        "lat": lat,
        "lng": lng,
        "address": address_text(props),
        "phone": first_text(phones),
        "website": first_text(websites),
        "attributes": Jsonb(attributes),
        "provider_data": Jsonb(provider_data),
    }


def geojsonseq_features(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.lstrip("\x1e").strip()
            if not line:
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                yield value


def download(city: City, output: Path) -> None:
    command = [
        "overturemaps", "download",
        f"--bbox={city.bbox}",
        "-f", "geojsonseq",
        "--type=place",
        "-o", str(output),
    ]
    print(f"[overture] downloading {city.label} ({city.bbox})", flush=True)
    subprocess.run(command, check=True)


def import_city(
    conn: psycopg.Connection[Any],
    city: City,
    path: Path,
    min_confidence: float,
    batch_size: int,
    max_places: int,
) -> tuple[int, int]:
    imported = 0
    skipped = 0
    batch: list[dict[str, Any]] = []

    with conn.cursor() as cur:
        for feature in geojsonseq_features(path):
            row = normalize_feature(feature, city, min_confidence)
            if row is None:
                skipped += 1
                continue

            batch.append(row)
            if len(batch) >= batch_size:
                cur.executemany(UPSERT_SQL, batch)
                conn.commit()
                imported += len(batch)
                batch.clear()
                print(f"[overture] {city.slug}: {imported} places imported", flush=True)

            if max_places > 0 and imported + len(batch) >= max_places:
                break

        if batch:
            cur.executemany(UPSERT_SQL, batch)
            conn.commit()
            imported += len(batch)

    return imported, skipped


def main() -> int:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is required", file=sys.stderr)
        return 2

    requested = [item.strip() for item in os.getenv("OVERTURE_CITIES", "spb,moscow").split(",") if item.strip()]
    cities: list[City] = []
    for slug in requested:
        city = CITIES.get(slug)
        if city is None:
            print(f"Unsupported city: {slug}", file=sys.stderr)
            return 2
        cities.append(city)

    min_confidence = float(os.getenv("OVERTURE_MIN_CONFIDENCE", "0.45"))
    batch_size = max(50, min(2000, int(os.getenv("OVERTURE_BATCH_SIZE", "500"))))
    max_places = max(0, int(os.getenv("OVERTURE_MAX_PLACES_PER_CITY", "0")))

    total = 0
    skipped = 0
    with tempfile.TemporaryDirectory(prefix="spot-overture-") as temp_dir:
        temp = Path(temp_dir)
        files: list[tuple[City, Path]] = []
        for city in cities:
            output = temp / f"{city.slug}.geojsonseq"
            download(city, output)
            files.append((city, output))

        with psycopg.connect(database_url) as conn:
            for city, path in files:
                city_imported, city_skipped = import_city(
                    conn,
                    city,
                    path,
                    min_confidence,
                    batch_size,
                    max_places,
                )
                total += city_imported
                skipped += city_skipped
                print(
                    f"[overture] {city.label}: imported={city_imported}, skipped={city_skipped}",
                    flush=True,
                )

    print(f"[overture] done: imported={total}, skipped={skipped}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
