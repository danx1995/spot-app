import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native';
import * as Location from 'expo-location';

import {
  getRouteSummary,
  type RouteLegSummary,
  type RouteSummary,
  type RouteTransport
} from '../services/api';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { CitySlug, DiscoveryInterest, Spot } from '../types';
import { distanceMeters, type Coordinates } from '../utils/geo';
import { getSpotOpenState } from '../utils/openingHours';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type RouteLength = 'short' | 'half' | 'day';

const ROUTE_LENGTHS: Array<{
  id: RouteLength;
  label: string;
  hint: string;
  places: number;
}> = [
  { id: 'short', label: '2–3 часа', hint: '3 места', places: 3 },
  { id: 'half', label: 'Полдня', hint: '4 места', places: 4 },
  { id: 'day', label: 'Весь день', hint: '5 мест', places: 5 }
];

const CITY_LABELS: Record<CitySlug, string> = {
  spb: 'Санкт-Петербург',
  moscow: 'Москва'
};

const CITY_CENTERS: Record<CitySlug, Coordinates> = {
  spb: { latitude: 59.9386, longitude: 30.3141 },
  moscow: { latitude: 55.7558, longitude: 37.6173 }
};

const MAX_CITY_START_DISTANCE_METERS = 120_000;
const STOP_DWELL_SECONDS = 45 * 60;

function spotCoordinates(spot: Spot): Coordinates {
  return {
    latitude: spot.latitude,
    longitude: spot.longitude
  };
}

function estimateTravelSeconds(
  from: Coordinates,
  to: Coordinates,
  transport: RouteTransport
) {
  const straight = distanceMeters(from, to);
  const roadFactor = transport === 'driving' ? 1.28 : 1.18;
  const speedMetersPerSecond = transport === 'driving' ? 8.3 : 1.3;
  return Math.max(0, Math.round((straight * roadFactor) / speedMetersPerSecond));
}

function scoreSpot(
  spot: Spot,
  interests: DiscoveryInterest[],
  arrival?: Date
) {
  let score = Math.max(0, spot.rating) * 1.15;

  if (spot.favorite) score += 2.4;
  if (spot.status === 'booked') score += 1.2;

  const interestIndex = interests.indexOf(spot.category as DiscoveryInterest);
  if (interestIndex >= 0) {
    score += Math.max(0.8, 2.2 - interestIndex * 0.25);
  }

  const reviews = Math.max(0, spot.reviewCount ?? 0);
  score += Math.min(1.4, Math.log10(reviews + 1) * 0.35);

  if (arrival) {
    const openState = getSpotOpenState(spot, arrival);
    if (openState.kind === 'open') score += 1.8;
    if (openState.kind === 'closed') score -= 5;
  }

  return score;
}

function buildRoute(
  spots: Spot[],
  interests: DiscoveryInterest[],
  count: number,
  variation: number,
  transport: RouteTransport,
  start: Coordinates | null,
  now: Date
) {
  const candidates = spots.filter((spot) => spot.status !== 'visited');
  if (candidates.length === 0) return [];

  const route: Spot[] = [];
  const used = new Set<string>();
  const seenCategories = new Set<string>();
  let elapsedSeconds = 0;

  while (route.length < Math.min(count, candidates.length)) {
    const previousCoordinates = route.length > 0
      ? spotCoordinates(route[route.length - 1] as Spot)
      : start;
    let best: Spot | null = null;
    let bestScore = -Infinity;
    let bestTravelSeconds = 0;

    for (const candidate of candidates) {
      if (used.has(candidate.id)) continue;

      const travelSeconds = previousCoordinates
        ? estimateTravelSeconds(previousCoordinates, spotCoordinates(candidate), transport)
        : 0;
      const arrival = new Date(now.getTime() + (elapsedSeconds + travelSeconds) * 1000);
      const distance = previousCoordinates
        ? distanceMeters(previousCoordinates, spotCoordinates(candidate))
        : 0;
      const distancePenalty = (distance / 1000) * (transport === 'driving' ? 0.08 : 0.3);
      const diversityBonus = seenCategories.has(candidate.category) ? 0 : 1.25;
      const rerollBias = ((candidate.id.length + variation * 3 + route.length) % 7) * 0.09;
      const candidateScore =
        scoreSpot(candidate, interests, arrival) +
        diversityBonus +
        rerollBias -
        distancePenalty;

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        best = candidate;
        bestTravelSeconds = travelSeconds;
      }
    }

    if (!best) break;

    elapsedSeconds += bestTravelSeconds;
    route.push(best);
    used.add(best.id);
    seenCategories.add(best.category);
    elapsedSeconds += STOP_DWELL_SECONDS;
  }

  return route;
}

function localRouteSummary(
  points: Coordinates[],
  transport: RouteTransport
): RouteSummary | null {
  if (points.length < 2) return null;

  const legs: RouteLegSummary[] = [];
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1] as Coordinates;
    const to = points[index] as Coordinates;
    const straight = distanceMeters(from, to);
    const roadFactor = transport === 'driving' ? 1.28 : 1.18;
    const distance = Math.round(straight * roadFactor);
    const duration = estimateTravelSeconds(from, to, transport);

    legs.push({
      distanceMeters: distance,
      durationSeconds: duration
    });
    totalDistanceMeters += distance;
    totalDurationSeconds += duration;
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
  if (value < 1000) return String(Math.max(0, Math.round(value))) + ' м';
  const km = value / 1000;
  return (km >= 10 ? km.toFixed(0) : km.toFixed(1).replace('.', ',')) + ' км';
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return String(minutes) + ' мин';

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0
    ? String(hours) + ' ч ' + String(rest) + ' мин'
    : String(hours) + ' ч';
}

function formatMoscowTime(date: Date) {
  const local = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const hours = String(local.getUTCHours()).padStart(2, '0');
  const minutes = String(local.getUTCMinutes()).padStart(2, '0');
  return hours + ':' + minutes;
}

function buildMapsURL(
  route: Spot[],
  start: Coordinates | null,
  transport: RouteTransport
) {
  if (route.length < 2) return null;

  const coordinate = (value: Coordinates) => String(value.latitude) + ',' + String(value.longitude);
  const destination = spotCoordinates(route[route.length - 1] as Spot);
  const origin = start ?? spotCoordinates(route[0] as Spot);
  const waypointSpots = start ? route.slice(0, -1) : route.slice(1, -1);

  const params = new URLSearchParams({
    api: '1',
    origin: coordinate(origin),
    destination: coordinate(destination),
    travelmode: transport === 'driving' ? 'driving' : 'walking'
  });

  if (waypointSpots.length > 0) {
    params.set(
      'waypoints',
      waypointSpots.map((spot) => coordinate(spotCoordinates(spot))).join('|')
    );
  }

  return 'https://www.google.com/maps/dir/?' + params.toString();
}

function routeShareText(city: string, route: Spot[]) {
  const places = route
    .map((spot, index) => `${index + 1}. ${spot.name} — ${spot.address}`)
    .join('\n');

  return [
    `СПОТ · маршрут по ${city}`,
    '',
    places,
    '',
    'Собрано из моих сохранённых мест'
  ].join('\n');
}

export function RoutePlannerModal({ visible, onClose }: Props) {
  const dark = useColorScheme() === 'dark';
  const {
    savedSpots,
    selectedCity,
    interests,
    createCollection,
    togglePlaceInCollection
  } = useSpotStore();

  const [length, setLength] = useState<RouteLength>('half');
  const [variation, setVariation] = useState(0);
  const [saved, setSaved] = useState(false);
  const [routeCity, setRouteCity] = useState<CitySlug>(selectedCity);
  const [transport, setTransport] = useState<RouteTransport>('walking');
  const [startFromMe, setStartFromMe] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [remoteSummary, setRemoteSummary] = useState<RouteSummary | null>(null);
  const [routingBusy, setRoutingBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRouteCity(selectedCity);
    setVariation(0);
    setSaved(false);
    setRemoteSummary(null);
  }, [selectedCity, visible]);

  useEffect(() => {
    if (!startFromMe || !userLocation) return;
    if (distanceMeters(userLocation, CITY_CENTERS[routeCity]) > MAX_CITY_START_DISTANCE_METERS) {
      setStartFromMe(false);
    }
  }, [routeCity, startFromMe, userLocation]);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;
  const raised = dark ? colors.darkSurfaceRaised : colors.lightMuted;

  const option = ROUTE_LENGTHS.find((item) => item.id === length) ?? ROUTE_LENGTHS[1]!;
  const planBaseTime = useMemo(
    () => new Date(),
    [
      length,
      routeCity,
      startFromMe,
      transport,
      userLocation?.latitude,
      userLocation?.longitude,
      variation,
      visible
    ]
  );
  const startCoordinate = startFromMe ? userLocation : null;

  const eligible = useMemo(
    () => savedSpots.filter((spot) => spot.city === routeCity && spot.status !== 'visited'),
    [routeCity, savedSpots]
  );
  const route = useMemo(
    () => buildRoute(
      eligible,
      interests,
      option.places,
      variation,
      transport,
      startCoordinate,
      planBaseTime
    ),
    [
      eligible,
      interests,
      option.places,
      planBaseTime,
      startCoordinate,
      transport,
      variation
    ]
  );

  const routePoints = useMemo(() => {
    const points = route.map(spotCoordinates);
    return startCoordinate ? [startCoordinate, ...points] : points;
  }, [route, startCoordinate]);

  const fallbackSummary = useMemo(
    () => localRouteSummary(routePoints, transport),
    [routePoints, transport]
  );

  useEffect(() => {
    let active = true;

    if (!visible || routePoints.length < 2) {
      setRemoteSummary(null);
      setRoutingBusy(false);
      return () => {
        active = false;
      };
    }

    setRemoteSummary(null);
    setRoutingBusy(true);

    const timer = setTimeout(() => {
      void getRouteSummary(routePoints, transport)
        .then((summary) => {
          if (active) setRemoteSummary(summary);
        })
        .finally(() => {
          if (active) setRoutingBusy(false);
        });
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [routePoints, transport, visible]);

  const effectiveSummary = remoteSummary ?? fallbackSummary;
  const scheduledRoute = useMemo(() => {
    let elapsedSeconds = 0;

    return route.map((spot, index) => {
      if (startCoordinate && index === 0) {
        elapsedSeconds += effectiveSummary?.legs[0]?.durationSeconds ?? 0;
      } else if (index > 0) {
        const legIndex = startCoordinate ? index : index - 1;
        elapsedSeconds += effectiveSummary?.legs[legIndex]?.durationSeconds ?? 0;
      }

      const arrival = new Date(planBaseTime.getTime() + elapsedSeconds * 1000);
      const openState = getSpotOpenState(spot, arrival);
      elapsedSeconds += STOP_DWELL_SECONDS;

      return { spot, arrival, openState };
    });
  }, [effectiveSummary, planBaseTime, route, startCoordinate]);

  const transportLabel = transport === 'driving' ? 'На машине' : 'Пешком';
  const routeSourceLabel = routingBusy
    ? 'считаем маршрут по улицам…'
    : remoteSummary?.source === '2gis'
      ? 'по улицам 2ГИС'
      : remoteSummary?.source === 'mixed'
        ? 'частично по улицам 2ГИС'
        : 'оценка по расстоянию';

  function rebuild() {
    setSaved(false);
    setVariation((current) => current + 1);
  }

  async function toggleStartFromMe() {
    if (startFromMe) {
      setStartFromMe(false);
      return;
    }

    setLocationBusy(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== 'granted') {
        Alert.alert(
          'Геопозиция не разрешена',
          'СПОТ может строить маршрут и без неё. Разрешение запрашивается только для старта от текущего места.'
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      const coordinates: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      if (distanceMeters(coordinates, CITY_CENTERS[routeCity]) > MAX_CITY_START_DISTANCE_METERS) {
        Alert.alert(
          'Вы далеко от выбранного города',
          'Старт «от меня» работает, когда вы находитесь рядом с выбранным городом.'
        );
        setUserLocation(coordinates);
        setStartFromMe(false);
        return;
      }

      setUserLocation(coordinates);
      setStartFromMe(true);
      setSaved(false);
      setVariation(0);
    } catch {
      Alert.alert(
        'Не удалось определить геопозицию',
        'Маршрут продолжит работать без текущего местоположения.'
      );
    } finally {
      setLocationBusy(false);
    }
  }

  function saveAsCollection() {
    if (route.length < 2) return;

    const collection = createCollection({
      title: `Маршрут · ${CITY_LABELS[routeCity]}`,
      subtitle: option.label + ' · ' + String(route.length) + ' мест · ' + transportLabel,
      city: routeCity
    });

    for (const spot of route) {
      togglePlaceInCollection(collection.id, spot.id);
    }

    setSaved(true);
    Alert.alert(
      'Маршрут сохранён',
      `Создали подборку «${collection.title}». Её можно менять и делиться ей как обычной подборкой.`
    );
  }

  async function shareRoute() {
    if (route.length < 2) return;

    const routeMeta = effectiveSummary
      ? transportLabel + ' · ' +
        formatDistance(effectiveSummary.totalDistanceMeters) + ' · ' +
        formatDuration(effectiveSummary.totalDurationSeconds) + ' в пути'
      : transportLabel;

    await Share.share({
      title: 'Маршрут · ' + CITY_LABELS[routeCity],
      message: routeShareText(CITY_LABELS[routeCity], route) + '\n' + routeMeta
    });
  }

  async function openRouteInMaps() {
    const url = buildMapsURL(route, startCoordinate, transport);
    if (!url) return;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Не удалось открыть карты', 'Попробуйте ещё раз или поделитесь маршрутом.');
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.green }]}>ИЗ МОИХ СПОТОВ</Text>
            <Text style={[styles.title, { color: text }]}>Собрать маршрут</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              Учитываем интересы, расстояние и часы работы мест к моменту прибытия.
            </Text>
          </View>
          <Pressable onPress={onClose} style={[styles.close, { backgroundColor: surface }]}>
            <Text style={[styles.closeText, { color: text }]}>×</Text>
          </Pressable>
        </View>

        <View style={styles.cityRow}>
          {([
            ['spb', 'СПБ'],
            ['moscow', 'Москва']
          ] as Array<[CitySlug, string]>).map(([city, label]) => {
            const active = routeCity === city;
            return (
              <Pressable
                key={city}
                onPress={() => {
                  setRouteCity(city);
                  setVariation(0);
                  setSaved(false);
                }}
                style={[
                  styles.cityChip,
                  { backgroundColor: active ? '#173528' : surface }
                ]}
              >
                <Text style={[styles.cityChipText, { color: active ? colors.green : muted }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.transportRow}>
          {([
            ['walking', 'Пешком', '⌁'],
            ['driving', 'На машине', '→']
          ] as Array<[RouteTransport, string, string]>).map(([value, label, icon]) => {
            const active = transport === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  setTransport(value);
                  setVariation(0);
                  setSaved(false);
                }}
                style={[
                  styles.transportChip,
                  { backgroundColor: active ? colors.green : raised }
                ]}
              >
                <Text style={[styles.transportIcon, { color: active ? colors.black : colors.green }]}>
                  {icon}
                </Text>
                <Text style={[styles.transportText, { color: active ? colors.black : text }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => void toggleStartFromMe()}
            disabled={locationBusy}
            style={[
              styles.locationChip,
              {
                backgroundColor: startFromMe ? '#173528' : surface,
                opacity: locationBusy ? 0.6 : 1
              }
            ]}
          >
            {locationBusy ? (
              <ActivityIndicator size="small" color={colors.green} />
            ) : (
              <Text style={[styles.locationText, { color: startFromMe ? colors.green : text }]}>
                {startFromMe ? '✓ От меня' : '⌖ От меня'}
              </Text>
            )}
          </Pressable>
        </View>

        <Text style={[styles.locationHint, { color: muted }]}>
          Геопозиция запрашивается только после нажатия «От меня».
        </Text>

        <View style={styles.lengthRow}>
          {ROUTE_LENGTHS.map((item) => {
            const active = item.id === length;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setLength(item.id);
                  setVariation(0);
                  setSaved(false);
                }}
                style={[
                  styles.lengthChip,
                  { backgroundColor: active ? colors.green : raised }
                ]}
              >
                <Text style={[styles.lengthLabel, { color: active ? colors.black : text }]}>
                  {item.label}
                </Text>
                <Text style={[styles.lengthHint, { color: active ? '#0F4B34' : muted }]}>
                  {item.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {route.length < 2 ? (
            <View style={[styles.empty, { backgroundColor: surface }]}>
              <Text style={styles.emptyMark}>⌁</Text>
              <Text style={[styles.emptyTitle, { color: text }]}>Нужно хотя бы два спота</Text>
              <Text style={[styles.emptyText, { color: muted }]}>
                Сохрани ещё места со статусом «Хочу» или «Бронь» в {CITY_LABELS[routeCity]}, и СПОТ соберёт маршрут.
              </Text>
            </View>
          ) : (
            <>
              <View style={[styles.summary, { backgroundColor: surface }]}>
                <View style={styles.summaryCopy}>
                  <Text style={[styles.summaryCity, { color: colors.green }]}>
                    {CITY_LABELS[routeCity].toUpperCase()}
                  </Text>
                  <Text style={[styles.summaryTitle, { color: text }]}>
                    {option.label} · {route.length} остановки
                  </Text>
                  <Text style={[styles.summaryDistance, { color: muted }]}>
                    {effectiveSummary
                      ? formatDistance(effectiveSummary.totalDistanceMeters) + ' · ' +
                        formatDuration(effectiveSummary.totalDurationSeconds) + ' в пути'
                      : 'Считаем расстояние'}
                  </Text>
                  <Text style={[styles.summarySource, { color: muted }]}>
                    {transportLabel.toLowerCase()} · {routeSourceLabel}
                  </Text>
                </View>
                <Pressable onPress={rebuild} style={[styles.rebuild, { backgroundColor: raised }]}>
                  <Text style={[styles.rebuildText, { color: text }]}>↻ Ещё</Text>
                </Pressable>
              </View>

              <View style={styles.routeList}>
                {scheduledRoute.map((item, index) => {
                  const availabilityColor = item.openState.kind === 'open'
                    ? colors.green
                    : item.openState.kind === 'closed'
                      ? '#FF8C8C'
                      : muted;

                  return (
                    <View key={item.spot.id} style={styles.routeRow}>
                      <View style={styles.timeline}>
                        <View style={styles.number}>
                          <Text style={styles.numberText}>{index + 1}</Text>
                        </View>
                        {index < scheduledRoute.length - 1 ? <View style={styles.line} /> : null}
                      </View>

                      <View style={[styles.placeCard, { backgroundColor: surface }]}>
                        <View style={styles.placeTop}>
                          <View style={styles.placeCopy}>
                            <Text style={[styles.placeMeta, { color: colors.green }]}>
                              {item.spot.categoryLabel.toUpperCase()}
                              {item.spot.favorite ? ' · ЛЮБИМОЕ' : ''}
                            </Text>
                            <Text style={[styles.placeName, { color: text }]}>{item.spot.name}</Text>
                            <Text style={[styles.placeAddress, { color: muted }]} numberOfLines={2}>
                              {item.spot.address}
                            </Text>
                            <Text style={[styles.arrival, { color: availabilityColor }]}>
                              {formatMoscowTime(item.arrival)} · {item.openState.label}
                            </Text>
                          </View>
                          <Text style={[styles.rating, { color: text }]}>
                            ★ {item.spot.rating.toFixed(1)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={[styles.scheduleHint, { backgroundColor: raised }]}>
                <Text style={[styles.scheduleHintTitle, { color: text }]}>План по времени</Text>
                <Text style={[styles.scheduleHintText, { color: muted }]}>
                  На каждую остановку заложено примерно 45 минут. Закрытые к моменту прибытия места получают сильный штраф и обычно уходят из маршрута.
                </Text>
              </View>
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
          <Pressable
            onPress={() => void openRouteInMaps()}
            disabled={route.length < 2}
            style={[styles.mapsButton, route.length < 2 && styles.disabled]}
          >
            <Text style={styles.mapsButtonText}>↗ Открыть маршрут в картах</Text>
          </Pressable>

          <View style={styles.footerRow}>
            <Pressable
              onPress={() => void shareRoute()}
              disabled={route.length < 2}
              style={[
                styles.secondary,
                { backgroundColor: surface },
                route.length < 2 && styles.disabled
              ]}
            >
              <Text style={[styles.secondaryText, { color: text }]}>Поделиться</Text>
            </Pressable>
            <Pressable
              onPress={saveAsCollection}
              disabled={route.length < 2}
              style={[styles.primary, route.length < 2 && styles.disabled]}
            >
              <Text style={styles.primaryText}>
                {saved ? '✓ Сохранено' : '♥ В подборку'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 22
  },
  header: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14
  },
  headerCopy: {
    flex: 1
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  title: {
    marginTop: 5,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -1
  },
  subtitle: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19
  },
  close: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    fontSize: 25,
    lineHeight: 28
  },
  cityRow: {
    paddingHorizontal: 20,
    marginTop: 18,
    flexDirection: 'row',
    gap: 8
  },
  cityChip: {
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cityChipText: {
    fontSize: 10,
    fontWeight: '900'
  },
  transportRow: {
    paddingHorizontal: 20,
    marginTop: 10,
    flexDirection: 'row',
    gap: 7
  },
  transportChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  transportIcon: {
    fontSize: 14,
    fontWeight: '900'
  },
  transportText: {
    fontSize: 10,
    fontWeight: '900'
  },
  locationChip: {
    minWidth: 94,
    minHeight: 42,
    paddingHorizontal: 11,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  locationText: {
    fontSize: 10,
    fontWeight: '900'
  },
  locationHint: {
    paddingHorizontal: 22,
    marginTop: 6,
    fontSize: 9,
    lineHeight: 13
  },
  lengthRow: {
    paddingHorizontal: 20,
    marginTop: 10,
    flexDirection: 'row',
    gap: 8
  },
  lengthChip: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  lengthLabel: {
    fontSize: 12,
    fontWeight: '900'
  },
  lengthHint: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: '800'
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 184
  },
  summary: {
    minHeight: 102,
    borderRadius: 23,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  summaryCopy: {
    flex: 1
  },
  summaryCity: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2
  },
  summaryTitle: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '900'
  },
  summaryDistance: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '700'
  },
  summarySource: {
    marginTop: 3,
    fontSize: 9
  },
  rebuild: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rebuildText: {
    fontSize: 11,
    fontWeight: '900'
  },
  routeList: {
    marginTop: 14
  },
  routeRow: {
    flexDirection: 'row',
    gap: 10
  },
  timeline: {
    width: 34,
    alignItems: 'center'
  },
  number: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  numberText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: '900'
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 72,
    backgroundColor: '#2A3A31'
  },
  placeCard: {
    flex: 1,
    minHeight: 112,
    marginBottom: 10,
    borderRadius: 20,
    padding: 15
  },
  placeTop: {
    flexDirection: 'row',
    gap: 12
  },
  placeCopy: {
    flex: 1
  },
  placeMeta: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1
  },
  placeName: {
    marginTop: 5,
    fontSize: 17,
    fontWeight: '900'
  },
  placeAddress: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 16
  },
  arrival: {
    marginTop: 7,
    fontSize: 10,
    fontWeight: '900'
  },
  rating: {
    fontSize: 11,
    fontWeight: '900'
  },
  scheduleHint: {
    marginTop: 4,
    borderRadius: 19,
    padding: 15
  },
  scheduleHintTitle: {
    fontSize: 11,
    fontWeight: '900'
  },
  scheduleHintText: {
    marginTop: 4,
    fontSize: 9,
    lineHeight: 14
  },
  empty: {
    marginTop: 8,
    borderRadius: 24,
    padding: 26,
    alignItems: 'center'
  },
  emptyMark: {
    color: colors.green,
    fontSize: 35,
    fontWeight: '900'
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '900'
  },
  emptyText: {
    marginTop: 7,
    maxWidth: 290,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24
  },
  mapsButton: {
    minHeight: 51,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mapsButtonText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '900'
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryText: {
    fontSize: 12,
    fontWeight: '900'
  },
  primary: {
    flex: 1.2,
    minHeight: 48,
    borderRadius: 17,
    backgroundColor: '#173528',
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '900'
  },
  disabled: {
    opacity: 0.35
  }
});
