export type CitySlug = 'spb' | 'moscow';

export type SpotCategory =
  | 'restaurant'
  | 'coffee'
  | 'bar'
  | 'hotel'
  | 'culture'
  | 'entertainment'
  | 'shop'
  | 'park'
  | 'other';

export type DiscoveryInterest =
  | 'restaurant'
  | 'coffee'
  | 'bar'
  | 'hotel'
  | 'culture';

export type SpotStatus = 'want' | 'visited' | 'booked';

export type SpotDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type SpotTimeRange = {
  from?: string;
  to?: string;
};

export type SpotOpeningHours = {
  is24x7?: boolean;
  days?: Partial<Record<SpotDay, SpotTimeRange[]>>;
};

export type Spot = {
  id: string;
  name: string;
  category: SpotCategory;
  categoryLabel: string;
  city: CitySlug;
  cityLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  rating: number;
  reviewCount?: number;
  openingHours?: SpotOpeningHours;
  description?: string;
  priceLevel?: number;
  status: SpotStatus;
  savedAt?: string;
  visitedAt?: string;
  favorite?: boolean;
  note?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  sourceTitle?: string;
  sourceExcerpt?: string;
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
  subtitle: string;
  city: CitySlug | 'both';
  cityLabel: string;
  placeIds: string[];
  routePlan?: CollectionRoutePlan;
  createdAt: string;
  sourceCollectionId?: string;
};
