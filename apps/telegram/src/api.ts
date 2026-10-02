export type CitySlug = 'spb' | 'moscow';
export type SpotStatus = 'want' | 'visited' | 'booked';

export type Spot = {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  city: CitySlug;
  cityLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount?: number;
  distanceMeters?: number;
  status: SpotStatus;
  favorite: boolean;
  note?: string;
};

export type CollectionRoutePlan = {
  kind: 'route';
  transport: 'walking' | 'driving';
  startPreset: 'now' | 'evening' | 'tomorrow';
  stopMinutes: 30 | 45 | 60;
  startMode: 'first_stop' | 'current_location';
};

export type Collection = {
  id: string;
  title: string;
  subtitle?: string;
  city: CitySlug | 'both';
  cityLabel?: string;
  placeIds: string[];
  routePlan?: CollectionRoutePlan;
  createdAt?: string;
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

export type CloudPayload = {
  selected_city: CitySlug;
  saved_spots: Spot[];
  collections: Collection[];
  interests: string[];
};

export type Session = {
  userId: string;
  token: string;
  profile: {
    id: string;
    is_guest: boolean;
    display_name?: string;
    avatar_url?: string;
    home_city?: string;
    theme?: string;
  };
};

type CloudEnvelope = {
  revision: number;
  state: CloudPayload | null;
};

type CatalogPlace = {
  id: string;
  name: string;
  category: string;
  category_label: string;
  city: CitySlug;
  city_label: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  review_count?: number;
  distance_meters?: number;
};

const apiBaseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function endpoint(path: string) {
  return apiBaseUrl ? apiBaseUrl + path : path;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint(path), init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return await response.json() as T;
}

export async function telegramLogin(initData: string): Promise<Session> {
  const payload = await request<{
    user_id: string;
    token: string;
    profile: Session['profile'];
  }>('/api/v1/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: initData })
  });

  return {
    userId: payload.user_id,
    token: payload.token,
    profile: payload.profile
  };
}

export async function loadCloud(token: string): Promise<CloudEnvelope> {
  return await request<CloudEnvelope>('/api/v1/me/state', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function saveCloud(
  token: string,
  baseRevision: number,
  state: CloudPayload
): Promise<CloudEnvelope> {
  return await request<CloudEnvelope>('/api/v1/me/state', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      base_revision: baseRevision,
      state
    })
  });
}

export async function searchPlaces(
  token: string,
  query: string,
  city: CitySlug,
  category?: string,
  coordinates?: RoutePoint
): Promise<Spot[]> {
  const params = new URLSearchParams({ q: query, city });
  if (category) params.set('category', category);
  if (coordinates) {
    params.set('lat', String(coordinates.latitude));
    params.set('lng', String(coordinates.longitude));
  }

  const places = await request<CatalogPlace[]>('/api/v1/places?' + params.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });

  return places.map((place) => ({
    id: place.id,
    name: place.name,
    category: place.category,
    categoryLabel: place.category_label,
    city: place.city,
    cityLabel: place.city_label,
    address: place.address,
    latitude: place.lat,
    longitude: place.lng,
    rating: place.rating,
    reviewCount: place.review_count,
    distanceMeters: place.distance_meters,
    status: 'want',
    favorite: false
  }));
}

export async function getRouteSummary(
  token: string,
  points: RoutePoint[],
  transport: RouteTransport = 'walking'
): Promise<RouteSummary | null> {
  if (points.length < 2) return null;

  const payload = await request<{
    transport: RouteTransport;
    source: '2gis' | 'mixed' | 'estimate';
    legs: Array<{
      distance_meters: number;
      duration_seconds: number;
    }>;
    total_distance_meters: number;
    total_duration_seconds: number;
  }>('/api/v1/routes/summary', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transport,
      points: points.map((point) => ({
        lat: point.latitude,
        lng: point.longitude
      }))
    })
  });

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
}

export async function importPlaceLink(
  token: string,
  url: string,
  city: CitySlug
): Promise<Spot[]> {
  const payload = await request<{ places?: CatalogPlace[]; place?: CatalogPlace }>(
    '/api/v1/imports/link',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, city })
    }
  );

  const raw = payload.places ?? (payload.place ? [payload.place] : []);
  return raw.map((place) => ({
    id: place.id,
    name: place.name,
    category: place.category,
    categoryLabel: place.category_label,
    city: place.city,
    cityLabel: place.city_label,
    address: place.address,
    latitude: place.lat,
    longitude: place.lng,
    rating: place.rating,
    reviewCount: place.review_count,
    distanceMeters: place.distance_meters,
    status: 'want',
    favorite: false
  }));
}

export function emptyCloud(): CloudPayload {
  return {
    selected_city: 'spb',
    saved_spots: [],
    collections: [],
    interests: []
  };
}
