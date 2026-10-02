export type CitySlug = 'spb' | 'moscow';

export type SpotCategory =
  | 'restaurant'
  | 'coffee'
  | 'bar'
  | 'hotel'
  | 'culture'
  | 'entertainment'
  | 'shop'
  | 'park';

export type SpotStatus = 'want' | 'visited' | 'booked';

export type Spot = {
  id: string;
  name: string;
  category: SpotCategory;
  categoryLabel: string;
  city: CitySlug;
  cityLabel: string;
  address: string;
  distanceMeters: number;
  rating: number;
  priceLevel?: number;
  status: SpotStatus;
  favorite?: boolean;
  note?: string;
};

export type Collection = {
  id: string;
  title: string;
  subtitle: string;
  count: number;
  cityLabel: string;
};
