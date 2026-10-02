declare const __DEV__: boolean;

import { appConfig } from '../config';
import { spots as fallbackSpots } from '../data/mock';
import { ensureGuestSession } from './cloudSync';
import type { CitySlug, Spot, SpotCategory } from '../types';

type ApiPlace = {
  id: string;
  name: string;
  category: SpotCategory;
  category_label: string;
  city: CitySlug;
  city_label: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  distance_meters?: number;
};

export type LinkImportResult = {
  status: 'resolved' | 'needs_context';
  platform: string;
  source_url: string;
  message?: string;
  place?: Spot;
};

function fromApiPlace(place: ApiPlace): Spot {
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    categoryLabel: place.category_label,
    city: place.city,
    cityLabel: place.city_label,
    address: place.address,
    latitude: place.lat,
    longitude: place.lng,
    distanceMeters: place.distance_meters ?? 0,
    rating: place.rating,
    status: 'want'
  };
}

function fallbackSearch(query: string, city: CitySlug) {
  const q = query.trim().toLowerCase();
  return fallbackSpots.filter((spot) => {
    if (spot.city !== city) return false;
    if (!q) return true;
    return `${spot.name} ${spot.address} ${spot.categoryLabel}`.toLowerCase().includes(q);
  });
}

export async function searchPlaces(query: string, city: CitySlug = 'spb'): Promise<Spot[]> {
  const params = new URLSearchParams({ q: query, city });

  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/places?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Places API returned ${response.status}`);
    }

    const data = await response.json() as ApiPlace[];
    return data.map(fromApiPlace);
  } catch {
    return __DEV__ ? fallbackSearch(query, city) : [];
  }
}

export async function importPlaceLink(url: string, city: CitySlug): Promise<LinkImportResult> {
  const session = await ensureGuestSession();

  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/imports/link`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`
    },
    body: JSON.stringify({ url, city })
  });

  if (!response.ok) {
    let message = 'Не удалось обработать ссылку';
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // keep user-friendly fallback
    }
    throw new Error(message);
  }

  const payload = await response.json() as {
    status: 'resolved' | 'needs_context';
    platform: string;
    source_url: string;
    message?: string;
    place?: ApiPlace;
  };

  return {
    ...payload,
    place: payload.place
      ? {
          ...fromApiPlace(payload.place),
          sourceUrl: payload.source_url,
          sourcePlatform: payload.platform
        }
      : undefined
  };
}
