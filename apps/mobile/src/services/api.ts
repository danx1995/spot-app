declare const __DEV__: boolean;

import { appConfig } from '../config';
import { spots as fallbackSpots } from '../data/mock';
import { ensureGuestSession } from './cloudSync';
import type { CitySlug, Spot, SpotCategory, SpotOpeningHours } from '../types';

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
  review_count?: number;
  opening_hours?: {
    is_24x7?: boolean;
    days?: SpotOpeningHours['days'];
  };
  description?: string;
  distance_meters?: number;
};

export type DetectedPlaceImport = {
  query: string;
  candidates: Spot[];
};

export type LinkImportResult = {
  status: 'resolved' | 'needs_context';
  platform: string;
  source_url: string;
  message?: string;
  suggestedQuery?: string;
  suggestedCity?: CitySlug;
  place?: Spot;
  candidates: Spot[];
  detected: DetectedPlaceImport[];
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
    reviewCount: place.review_count,
    openingHours: place.opening_hours ? {
      is24x7: place.opening_hours.is_24x7,
      days: place.opening_hours.days
    } : undefined,
    description: place.description?.trim() || undefined,
    status: 'want'
  };
}

export type SearchPlacesOptions = {
  latitude?: number;
  longitude?: number;
  category?: SpotCategory;
};

export type RouteTransport = 'walking' | 'driving' | 'bicycle';

export type RoutePoint = {
  latitude: number;
  longitude: number;
};

export type RouteLegSummary = {
  distanceMeters: number;
  durationSeconds: number;
};

export type RouteSummary = {
  transport: RouteTransport;
  source: '2gis' | 'mixed' | 'estimate';
  legs: RouteLegSummary[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
};

function fallbackSearch(
  query: string,
  city: CitySlug,
  category?: SpotCategory
) {
  const q = query.trim().toLowerCase();
  return fallbackSpots.filter((spot) => {
    if (spot.city !== city) return false;
    if (category && spot.category !== category) return false;
    if (!q) return true;
    return `${spot.name} ${spot.address} ${spot.categoryLabel}`.toLowerCase().includes(q);
  });
}

export async function searchPlaces(
  query: string,
  city: CitySlug = 'spb',
  options: SearchPlacesOptions = {}
): Promise<Spot[]> {
  const params = new URLSearchParams({ q: query, city });

  if (options.category) {
    params.set('category', options.category);
  }
  if (
    Number.isFinite(options.latitude) &&
    Number.isFinite(options.longitude)
  ) {
    params.set('lat', String(options.latitude));
    params.set('lng', String(options.longitude));
  }

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
    return __DEV__ ? fallbackSearch(query, city, options.category) : [];
  }
}

export async function getRouteSummary(
  points: RoutePoint[],
  transport: RouteTransport = 'walking'
): Promise<RouteSummary | null> {
  if (points.length < 2) return null;

  try {
    const session = await ensureGuestSession();
    const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/routes/summary`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`
      },
      body: JSON.stringify({
        transport,
        points: points.map((point) => ({
          lat: point.latitude,
          lng: point.longitude
        }))
      })
    });

    if (!response.ok) {
      throw new Error(`Route API returned ${response.status}`);
    }

    const payload = await response.json() as {
      transport: RouteTransport;
      source: '2gis' | 'mixed' | 'estimate';
      legs: Array<{
        distance_meters: number;
        duration_seconds: number;
      }>;
      total_distance_meters: number;
      total_duration_seconds: number;
    };

    return {
      transport: payload.transport,
      source: payload.source,
      legs: payload.legs.map((leg) => ({
        distanceMeters: leg.distance_meters,
        durationSeconds: leg.duration_seconds
      })),
      totalDistanceMeters: payload.total_distance_meters,
      totalDurationSeconds: payload.total_duration_seconds
    };
  } catch {
    return null;
  }
}

export async function importPlaceLink(url: string, city: CitySlug, hint?: string): Promise<LinkImportResult> {
  const session = await ensureGuestSession();

  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/imports/link`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`
    },
    body: JSON.stringify({ url, city, hint: hint?.trim() || undefined })
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
    source_title?: string;
    source_excerpt?: string;
    suggested_query?: string;
    suggested_city?: CitySlug;
    place?: ApiPlace;
    candidates?: ApiPlace[];
    detected?: Array<{
      query: string;
      candidates?: ApiPlace[];
    }>;
  };

  const withSource = (place: ApiPlace): Spot => ({
    ...fromApiPlace(place),
    sourceUrl: payload.source_url,
    sourcePlatform: payload.platform,
    sourceTitle: payload.source_title?.trim() || undefined,
    sourceExcerpt: payload.source_excerpt?.trim() || undefined
  });

  return {
    status: payload.status,
    platform: payload.platform,
    source_url: payload.source_url,
    message: payload.message,
    suggestedQuery: payload.suggested_query,
    suggestedCity: payload.suggested_city,
    place: payload.place ? withSource(payload.place) : undefined,
    candidates: (payload.candidates ?? []).map(withSource),
    detected: (payload.detected ?? []).map((item) => ({
      query: item.query,
      candidates: (item.candidates ?? []).map(withSource)
    }))
  };
}
