import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import type { CitySlug, RoutePoint, Spot } from './api';

type Props = {
  city: CitySlug;
  spots: Spot[];
  userLocation?: RoutePoint | null;
  onSelect: (spot: Spot) => void;
};

const cityCenters: Record<CitySlug, [number, number]> = {
  spb: [59.9386, 30.3141],
  moscow: [55.7558, 37.6173]
};

function markerIcon(spot: Spot) {
  const symbols: Record<string, string> = {
    restaurant: '🍽',
    coffee: '☕',
    bar: '🍸',
    hotel: '🏨',
    culture: '🎭',
    entertainment: '🎟',
    shop: '🛍',
    park: '🌿'
  };

  return L.divIcon({
    className: 'spot-map-marker-host',
    html: `<div class="spot-map-marker"><span>${symbols[spot.category] || '♥'}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 32]
  });
}

const userIcon = L.divIcon({
  className: 'spot-map-marker-host',
  html: '<div class="spot-user-marker"><span></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

export function SpotMap({
  city,
  spots,
  userLocation,
  onSelect
}: Props) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return;

    const map = L.map(nodeRef.current, {
      zoomControl: false,
      attributionControl: true
    }).setView(cityCenters[city], city === 'spb' ? 12 : 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    const invalidate = window.setTimeout(() => map.invalidateSize(), 60);
    return () => {
      window.clearTimeout(invalidate);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    for (const spot of spots) {
      if (!Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude)) continue;
      if (Math.abs(spot.latitude) < 0.001 && Math.abs(spot.longitude) < 0.001) continue;

      const position: L.LatLngExpression = [spot.latitude, spot.longitude];
      bounds.push(position);

      const marker = L.marker(position, { icon: markerIcon(spot) });
      marker.on('click', () => onSelect(spot));
      marker.addTo(layer);
    }

    if (userLocation) {
      const point: L.LatLngExpression = [userLocation.latitude, userLocation.longitude];
      bounds.push(point);
      L.marker(point, { icon: userIcon, zIndexOffset: 1000 }).addTo(layer);
    }

    if (bounds.length === 0) {
      map.setView(cityCenters[city], city === 'spb' ? 12 : 11);
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(bounds), {
        padding: [34, 34],
        maxZoom: 14
      });
    }

    window.setTimeout(() => map.invalidateSize(), 30);
  }, [city, onSelect, spots, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || spots.length > 0 || userLocation) return;
    map.setView(cityCenters[city], city === 'spb' ? 12 : 11);
  }, [city, spots.length, userLocation]);

  return <div className="spot-map" ref={nodeRef} aria-label="Карта мест" />;
}
