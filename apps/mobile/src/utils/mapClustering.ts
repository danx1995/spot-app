import type { Spot } from '../types';

export type MapViewport = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type SpotMarkerItem = {
  kind: 'spot';
  id: string;
  latitude: number;
  longitude: number;
  spot: Spot;
};

export type ClusterMarkerItem = {
  kind: 'cluster';
  id: string;
  latitude: number;
  longitude: number;
  spots: Spot[];
};

export type MapMarkerItem = SpotMarkerItem | ClusterMarkerItem;

const MIN_CLUSTER_COUNT = 7;
const GRID_COLUMNS = 6;
const MIN_CELL_SIZE = 0.0008;
const CLUSTER_DISABLE_DELTA = 0.012;

function spotMarker(spot: Spot): SpotMarkerItem {
  return {
    kind: 'spot',
    id: `spot:${spot.id}`,
    latitude: spot.latitude,
    longitude: spot.longitude,
    spot
  };
}

export function buildMapMarkers(
  spots: Spot[],
  viewport: MapViewport,
  selectedSpotID?: string
): MapMarkerItem[] {
  if (
    spots.length < MIN_CLUSTER_COUNT ||
    (viewport.latitudeDelta <= CLUSTER_DISABLE_DELTA &&
      viewport.longitudeDelta <= CLUSTER_DISABLE_DELTA)
  ) {
    return spots.map(spotMarker);
  }

  const selected = selectedSpotID
    ? spots.find((spot) => spot.id === selectedSpotID)
    : undefined;

  const clusterable = selected
    ? spots.filter((spot) => spot.id !== selected.id)
    : spots;

  const cellLat = Math.max(viewport.latitudeDelta / GRID_COLUMNS, MIN_CELL_SIZE);
  const cellLng = Math.max(viewport.longitudeDelta / GRID_COLUMNS, MIN_CELL_SIZE);
  const originLat = viewport.latitude - viewport.latitudeDelta / 2;
  const originLng = viewport.longitude - viewport.longitudeDelta / 2;

  const groups = new Map<string, Spot[]>();

  for (const spot of clusterable) {
    const row = Math.floor((spot.latitude - originLat) / cellLat);
    const column = Math.floor((spot.longitude - originLng) / cellLng);
    const key = `${row}:${column}`;
    const group = groups.get(key);
    if (group) {
      group.push(spot);
    } else {
      groups.set(key, [spot]);
    }
  }

  const markers: MapMarkerItem[] = [];

  for (const [cell, group] of groups) {
    if (group.length === 1) {
      const only = group[0];
      if (only) markers.push(spotMarker(only));
      continue;
    }

    const latitude = group.reduce((sum, spot) => sum + spot.latitude, 0) / group.length;
    const longitude = group.reduce((sum, spot) => sum + spot.longitude, 0) / group.length;

    markers.push({
      kind: 'cluster',
      id: `cluster:${cell}:${group.map((spot) => spot.id).sort().join(',')}`,
      latitude,
      longitude,
      spots: group
    });
  }

  if (selected) {
    markers.push(spotMarker(selected));
  }

  return markers;
}

export function clusterFocusRegion(
  spots: Spot[],
  current: MapViewport
): MapViewport {
  if (spots.length === 0) return current;

  let minLat = spots[0]?.latitude ?? current.latitude;
  let maxLat = minLat;
  let minLng = spots[0]?.longitude ?? current.longitude;
  let maxLng = minLng;

  for (const spot of spots.slice(1)) {
    minLat = Math.min(minLat, spot.latitude);
    maxLat = Math.max(maxLat, spot.latitude);
    minLng = Math.min(minLng, spot.longitude);
    maxLng = Math.max(maxLng, spot.longitude);
  }

  const latitudeDelta = Math.max(
    0.009,
    Math.min(current.latitudeDelta * 0.72, (maxLat - minLat) * 2.6 || current.latitudeDelta * 0.5)
  );
  const longitudeDelta = Math.max(
    0.009,
    Math.min(current.longitudeDelta * 0.72, (maxLng - minLng) * 2.6 || current.longitudeDelta * 0.5)
  );

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta
  };
}
