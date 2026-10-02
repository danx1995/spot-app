import type { Spot } from '../types';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number) {
  return value * Math.PI / 180;
}

export function distanceMeters(from: Coordinates, to: Coordinates) {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  const distance = 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(0, Math.round(distance));
}

export function spotWithDistance(spot: Spot, from: Coordinates): Spot {
  return {
    ...spot,
    distanceMeters: distanceMeters(from, {
      latitude: spot.latitude,
      longitude: spot.longitude
    })
  };
}
