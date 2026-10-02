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

function markerSymbol(category: string) {
  const icon = category === 'coffee'
    ? '<path d="M5 8h9v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Zm9 2h1.3a2 2 0 1 1 0 4H14M8 5c-.8-.8.2-1.5.2-2.2"/>'
    : category === 'bar'
      ? '<path d="M4 5h12l-4.8 5.8v4.5M8.7 15.3h5.2M7 9h6"/>'
      : category === 'hotel'
        ? '<path d="M5 17V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v12M14 9h1.5A1.5 1.5 0 0 1 17 10.5V17M7.5 7h1M10.5 7h1M7.5 10h1M10.5 10h1M4 17h14"/>'
        : category === 'culture'
          ? '<path d="m3 8 7-4 7 4M4 8h12M5.5 8v6M8.5 8v6M11.5 8v6M14.5 8v6M4 14h12M3 17h14"/>'
          : category === 'restaurant'
            ? '<path d="M6 4v5M4.5 4v3.5A1.5 1.5 0 0 0 6 9h0A1.5 1.5 0 0 0 7.5 7.5V4M6 9v8M12.5 4v13M12.5 4c2.5 1.2 3.5 3.6 2.8 6.2h-2.8"/>'
            : '<path d="M10 17s5-4.5 5-9a5 5 0 1 0-10 0c0 4.5 5 9 5 9Zm0-7.3a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z"/>';

  return '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg>';
}

function markerIcon(spot: Spot) {
  return L.divIcon({
    className: 'spot-map-marker-host',
    html: `<div class="spot-map-marker"><span>${markerSymbol(spot.category)}</span></div>`,
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
