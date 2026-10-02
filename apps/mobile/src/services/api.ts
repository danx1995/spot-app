import { spots as fallbackSpots } from '../data/mock';
import type { Spot, SpotCategory } from '../types';

const API_BASE_URL = 'http://localhost:8080';

type ApiPlace = {
  id: string;
  name: string;
  category: SpotCategory;
  category_label: string;
  city: 'spb' | 'moscow';
  city_label: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  distance_meters?: number;
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

function fallbackSearch(query: string, city: 'spb' | 'moscow') {
  const q = query.trim().toLowerCase();
  return fallbackSpots.filter((spot) => {
    if (spot.city !== city) return false;
    if (!q) return true;
    return `${spot.name} ${spot.address} ${spot.categoryLabel}`.toLowerCase().includes(q);
  });
}

export async function searchPlaces(query: string, city: 'spb' | 'moscow' = 'spb'): Promise<Spot[]> {
  const params = new URLSearchParams({ q: query, city });
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/places?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Places API returned ${response.status}`);
    }

    const data = await response.json() as ApiPlace[];
    return data.map(fromApiPlace);
  } catch {
    return fallbackSearch(query, city);
  }
}
