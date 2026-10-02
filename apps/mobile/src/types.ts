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

export type SpotStatus = 'want' | 'visited' | 'booked';

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
  priceLevel?: number;
  status: SpotStatus;
  visitedAt?: string;
  favorite?: boolean;
  note?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
};

export type Collection = {
  id: string;
  title: string;
  subtitle: string;
  city: CitySlug | 'both';
  cityLabel: string;
  placeIds: string[];
  createdAt: string;
};
