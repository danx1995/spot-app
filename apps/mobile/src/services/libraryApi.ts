import { appConfig } from '../config';
import type { CitySlug, Spot, SpotCategory, SpotOpeningHours } from '../types';
import { ensureGuestSession, resetGuestSession } from './cloudSync';

async function patchShared(collectionID: string, token: string) {
  return await fetch(
    `${appConfig.apiBaseUrl}/api/v1/me/collections/${encodeURIComponent(collectionID)}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ visibility: 'shared' })
    }
  );
}

export async function publishCollection(collectionID: string): Promise<string> {
  const session = await ensureGuestSession();
  let response = await patchShared(collectionID, session.token);

  // Snapshot projection is intentionally asynchronous from the mobile point
  // of view. A single short retry absorbs the rare race after an immediate
  // “create collection → share” action.
  if (response.status === 404) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    response = await patchShared(collectionID, session.token);
  }

  if (response.status === 401) {
    await resetGuestSession();
    throw new Error('session expired');
  }
  if (!response.ok) {
    throw new Error(`collection publish failed with ${response.status}`);
  }

  return `${appConfig.shareBaseUrl}/s/${encodeURIComponent(collectionID)}`;
}

type PublicApiPlace = {
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
  review_count?: number;
  opening_hours?: {
    is_24x7?: boolean;
    days?: SpotOpeningHours['days'];
  };
  description?: string;
};

type PublicApiCollection = {
  id: string;
  title: string;
  description?: string;
  city?: CitySlug;
  city_label?: string;
  place_ids: string[];
};

export type SharedCollectionPreview = {
  id: string;
  title: string;
  subtitle: string;
  city: CitySlug | 'both';
  cityLabel: string;
  spots: Spot[];
};

export async function getSharedCollection(collectionID: string): Promise<SharedCollectionPreview> {
  const response = await fetch(
    `${appConfig.apiBaseUrl}/api/v1/public/collections/${encodeURIComponent(collectionID)}`,
    {
      headers: { Accept: 'application/json' }
    }
  );

  if (response.status === 404) {
    throw new Error('Подборка недоступна');
  }
  if (!response.ok) {
    throw new Error(`shared collection failed with ${response.status}`);
  }

  const payload = await response.json() as {
    collection: PublicApiCollection;
    places: PublicApiPlace[];
  };

  const spots: Spot[] = payload.places.map((place) => ({
    id: place.id,
    name: place.name,
    category: place.category,
    categoryLabel: place.category_label,
    city: place.city,
    cityLabel: place.city_label,
    address: place.address,
    latitude: place.lat,
    longitude: place.lng,
    distanceMeters: 0,
    rating: place.rating,
    reviewCount: place.review_count,
    openingHours: place.opening_hours ? {
      is24x7: place.opening_hours.is_24x7,
      days: place.opening_hours.days
    } : undefined,
    description: place.description?.trim() || undefined,
    status: 'want'
  }));

  const uniqueCities = new Set(spots.map((spot) => spot.city));
  const collectionCity: CitySlug | 'both' = payload.collection.city
    ?? (uniqueCities.size === 1 ? spots[0]?.city ?? 'both' : 'both');

  return {
    id: payload.collection.id,
    title: payload.collection.title,
    subtitle: payload.collection.description?.trim() || 'Подборка из СПОТ',
    city: collectionCity,
    cityLabel: payload.collection.city_label?.trim()
      || (collectionCity === 'spb'
        ? 'Санкт-Петербург'
        : collectionCity === 'moscow'
          ? 'Москва'
          : 'Москва · Петербург'),
    spots
  };
}
