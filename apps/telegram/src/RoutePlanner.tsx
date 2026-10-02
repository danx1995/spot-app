import { useEffect, useMemo, useState } from 'react';

import {
  getRouteSummary,
  type CitySlug,
  type Collection,
  type RoutePoint,
  type RouteSummary,
  type RouteTransport,
  type Spot
} from './api';

type Props = {
  city: CitySlug;
  spots: Spot[];
  interests: string[];
  sessionToken?: string;
  onClose: () => void;
  onSave: (collection: Collection) => void;
};

type StartPreset = 'now' | 'evening' | 'tomorrow';

const cityLabels: Record<CitySlug, string> = {
  spb: 'Санкт-Петербург',
  moscow: 'Москва'
};

function distanceMeters(a: RoutePoint, b: RoutePoint) {
  const radius = 6_371_000;
  const phi1 = a.latitude * Math.PI / 180;
  const phi2 = b.latitude * Math.PI / 180;
  const dPhi = (b.latitude - a.latitude) * Math.PI / 180;
  const dLambda = (b.longitude - a.longitude) * Math.PI / 180;
  const h = Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function coordinates(spot: Spot): RoutePoint {
  return { latitude: spot.latitude, longitude: spot.longitude };
}

function buildRoute(
  spots: Spot[],
  interests: string[],
  count: number,
  variation: number,
  start: RoutePoint | null,
  transport: RouteTransport
) {
  const candidates = spots.filter((spot) => spot.status !== 'visited');
  const result: Spot[] = [];
  const used = new Set<string>();
  const categories = new Set<string>();

  while (result.length < Math.min(count, candidates.length)) {
    const previous = result.length
      ? coordinates(result[result.length - 1]!)
      : start;

    let best: Spot | null = null;
    let bestScore = -Infinity;

    for (const spot of candidates) {
      if (used.has(spot.id)) continue;

      let score = Math.max(0, spot.rating) * 1.1;
      if (spot.favorite) score += 2.3;
      if (spot.status === 'booked') score += 1;
      if (interests.includes(spot.category)) score += 1.8;
      if (!categories.has(spot.category)) score += 1.1;
      score += Math.min(1.2, Math.log10((spot.reviewCount ?? 0) + 1) * 0.3);

      if (previous) {
        const km = distanceMeters(previous, coordinates(spot)) / 1000;
        score -= km * (transport === 'driving' ? 0.08 : 0.31);
      }

      score += ((spot.id.length + variation * 13 + result.length * 7) % 19) / 25;

      if (score > bestScore) {
        bestScore = score;
        best = spot;
      }
    }

    if (!best) break;
    result.push(best);
    used.add(best.id);
    categories.add(best.category);
  }

  return result;
}

function localSummary(points: RoutePoint[], transport: RouteTransport): RouteSummary | null {
  if (points.length < 2) return null;

  const roadFactor = transport === 'driving' ? 1.28 : 1.18;
  const speed = transport === 'driving' ? 8.3 : 1.3;
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  const legs = [];

  for (let index = 1; index < points.length; index += 1) {
    const direct = distanceMeters(points[index - 1]!, points[index]!);
    const distance = Math.round(direct * roadFactor);
    const duration = Math.max(1, Math.round(distance / speed));
    totalDistanceMeters += distance;
    totalDurationSeconds += duration;
    legs.push({ distanceMeters: distance, durationSeconds: duration });
  }

  return {
    transport,
    source: 'estimate',
    legs,
    totalDistanceMeters,
    totalDurationSeconds
  };
}

function formatDistance(value: number) {
  if (value < 1000) return Math.round(value) + ' м';
  return (value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace('.', ',') + ' км';
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return minutes + ' мин';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? hours + ' ч ' + rest + ' мин' : hours + ' ч';
}

function mapsURL(route: Spot[], start: RoutePoint | null, transport: RouteTransport) {
  if (route.length < 2) return '';
  const encode = (point: RoutePoint) => point.latitude + ',' + point.longitude;
  const destination = coordinates(route[route.length - 1]!);
  const origin = start ?? coordinates(route[0]!);
  const waypointSpots = start ? route.slice(0, -1) : route.slice(1, -1);
  const params = new URLSearchParams({
    api: '1',
    origin: encode(origin),
    destination: encode(destination),
    travelmode: transport === 'driving' ? 'driving' : 'walking'
  });
  if (waypointSpots.length) {
    params.set('waypoints', waypointSpots.map((spot) => encode(coordinates(spot))).join('|'));
  }
  return 'https://www.google.com/maps/dir/?' + params.toString();
}

function requestTelegramLocation(): Promise<RoutePoint | null> {
  const manager = window.Telegram?.WebApp?.LocationManager;

  if (manager) {
    return new Promise((resolve) => {
      const receive = () => {
        if (!manager.isLocationAvailable) {
          resolve(null);
          return;
        }
        manager.getLocation((location) => {
          resolve(location ? {
            latitude: location.latitude,
            longitude: location.longitude
          } : null);
        });
      };

      if (manager.isInited) receive();
      else manager.init(receive);
    });
  }

  if (!navigator.geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 }
    );
  });
}

export function RoutePlanner({
  city,
  spots,
  interests,
  sessionToken,
  onClose,
  onSave
}: Props) {
  const [count, setCount] = useState(4);
  const [transport, setTransport] = useState<RouteTransport>('walking');
  const [startPreset, setStartPreset] = useState<StartPreset>('now');
  const [variation, setVariation] = useState(0);
  const [useLocation, setUseLocation] = useState(false);
  const [location, setLocation] = useState<RoutePoint | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const eligible = useMemo(
    () => spots.filter((spot) => spot.city === city && spot.status !== 'visited'),
    [city, spots]
  );

  const route = useMemo(
    () => buildRoute(
      eligible,
      interests,
      count,
      variation,
      useLocation ? location : null,
      transport
    ),
    [count, eligible, interests, location, transport, useLocation, variation]
  );

  const points = useMemo(() => {
    const routePoints = route.map(coordinates);
    return useLocation && location ? [location, ...routePoints] : routePoints;
  }, [location, route, useLocation]);

  const fallback = useMemo(() => localSummary(points, transport), [points, transport]);

  useEffect(() => {
    let active = true;

    if (!sessionToken || points.length < 2) {
      setSummary(null);
      return () => {
        active = false;
      };
    }

    setSummaryBusy(true);
    const timer = window.setTimeout(() => {
      void getRouteSummary(sessionToken, points, transport)
        .then((value) => {
          if (active) setSummary(value);
        })
        .catch(() => {
          if (active) setSummary(null);
        })
        .finally(() => {
          if (active) setSummaryBusy(false);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [points, sessionToken, transport]);

  const effective = summary ?? fallback;

  async function toggleLocation() {
    if (useLocation) {
      setUseLocation(false);
      return;
    }

    setLocationBusy(true);
    setNotice('');
    const next = await requestTelegramLocation();
    setLocationBusy(false);

    if (!next) {
      setNotice('Telegram не дал геопозицию. Маршрут можно собрать от первой точки.');
      return;
    }

    setLocation(next);
    setUseLocation(true);
    setVariation(0);
  }

  function saveRoute() {
    if (route.length < 2) return;

    const presetLabel = startPreset === 'now'
      ? 'Сейчас'
      : startPreset === 'evening'
        ? 'Сегодня · 19:00'
        : 'Завтра · 12:00';

    onSave({
      id: 'route_' + Date.now(),
      title: 'Маршрут · ' + cityLabels[city],
      subtitle: presetLabel + ' · ' + (transport === 'driving' ? 'На машине' : 'Пешком'),
      city,
      cityLabel: cityLabels[city],
      placeIds: route.map((spot) => spot.id),
      createdAt: new Date().toISOString(),
      routePlan: {
        kind: 'route',
        transport: transport === 'driving' ? 'driving' : 'walking',
        startPreset,
        stopMinutes: 45,
        startMode: useLocation ? 'current_location' : 'first_stop'
      }
    });
  }

  function openMaps() {
    const url = mapsURL(route, useLocation ? location : null, transport);
    if (!url) return;
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="planner-backdrop" role="dialog" aria-modal="true">
      <div className="planner-sheet">
        <div className="planner-head">
          <div>
            <span>ИЗ МОИХ СПОТОВ</span>
            <h2>Собрать маршрут</h2>
            <p>СПОТ соединит сохранённые места в компактный план.</p>
          </div>
          <button className="planner-close" onClick={onClose}>×</button>
        </div>

        <div className="planner-section-label">КАК ДОБИРАТЬСЯ</div>
        <div className="planner-grid two">
          <button className={transport === 'walking' ? 'active' : ''} onClick={() => setTransport('walking')}>⌁ Пешком</button>
          <button className={transport === 'driving' ? 'active' : ''} onClick={() => setTransport('driving')}>→ На машине</button>
        </div>

        <button
          className={useLocation ? 'planner-location active' : 'planner-location'}
          onClick={() => void toggleLocation()}
          disabled={locationBusy}
        >
          <span>{useLocation ? '✓' : '⌖'}</span>
          <div><b>{locationBusy ? 'Определяем…' : useLocation ? 'Старт от меня' : 'Начать от меня'}</b><small>Геопозицию Telegram запросит только после нажатия</small></div>
        </button>

        <div className="planner-section-label">КОГДА</div>
        <div className="planner-grid three">
          <button className={startPreset === 'now' ? 'active' : ''} onClick={() => setStartPreset('now')}>Сейчас</button>
          <button className={startPreset === 'evening' ? 'active' : ''} onClick={() => setStartPreset('evening')}>Вечером<small>19:00</small></button>
          <button className={startPreset === 'tomorrow' ? 'active' : ''} onClick={() => setStartPreset('tomorrow')}>Завтра<small>12:00</small></button>
        </div>

        <div className="planner-section-label">СКОЛЬКО МЕСТ</div>
        <div className="planner-grid three">
          {[3, 4, 5].map((value) => (
            <button key={value} className={count === value ? 'active' : ''} onClick={() => setCount(value)}>
              {value}<small>{value === 3 ? '2–3 часа' : value === 4 ? 'Полдня' : 'Весь день'}</small>
            </button>
          ))}
        </div>

        {notice ? <div className="planner-notice">{notice}</div> : null}

        {route.length < 2 ? (
          <div className="planner-empty">
            <span>⌁</span>
            <b>Нужно хотя бы два сохранённых места</b>
            <p>Добавь ещё споты со статусом «Хочу» или «Бронь» в {cityLabels[city]}.</p>
          </div>
        ) : (
          <>
            <div className="planner-summary">
              <div>
                <span>{cityLabels[city].toUpperCase()}</span>
                <b>{route.length} остановки · {transport === 'driving' ? 'на машине' : 'пешком'}</b>
                <small>
                  {effective
                    ? formatDistance(effective.totalDistanceMeters) + ' · ' + formatDuration(effective.totalDurationSeconds) + ' в пути'
                    : 'Считаем маршрут…'}
                  {summaryBusy ? ' · обновляем' : summary?.source === '2gis' ? ' · по улицам' : ''}
                </small>
              </div>
              <button onClick={() => setVariation((value) => value + 1)}>↻ Ещё</button>
            </div>

            <div className="planner-stops">
              {route.map((spot, index) => (
                <div className="planner-stop" key={spot.id}>
                  <div className="planner-index">{index + 1}</div>
                  <div className="planner-stop-copy">
                    <span>{spot.categoryLabel.toUpperCase()}</span>
                    <b>{spot.name}</b>
                    <small>{spot.address}</small>
                  </div>
                  <div className="planner-rating">★ {spot.rating.toFixed(1)}</div>
                </div>
              ))}
            </div>

            <div className="planner-actions">
              <button className="planner-maps" onClick={openMaps}>↗ Открыть в картах</button>
              <button className="planner-save" onClick={saveRoute}>♥ Сохранить маршрут</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
