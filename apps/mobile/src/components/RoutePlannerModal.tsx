import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native';

import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { CitySlug, DiscoveryInterest, Spot } from '../types';
import { distanceMeters } from '../utils/geo';

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

function scoreSpot(spot: Spot, interests: DiscoveryInterest[]) {
  let score = Math.max(0, spot.rating) * 1.15;

  if (spot.favorite) score += 2.4;
  if (spot.status === 'booked') score += 1.2;

  const interestIndex = interests.indexOf(spot.category as DiscoveryInterest);
  if (interestIndex >= 0) {
    score += Math.max(0.8, 2.2 - interestIndex * 0.25);
  }

  const reviews = Math.max(0, spot.reviewCount ?? 0);
  score += Math.min(1.4, Math.log10(reviews + 1) * 0.35);

  return score;
}

function buildRoute(
  spots: Spot[],
  interests: DiscoveryInterest[],
  count: number,
  variation: number
) {
  const candidates = spots
    .filter((spot) => spot.status !== 'visited')
    .sort((a, b) => scoreSpot(b, interests) - scoreSpot(a, interests));

  if (candidates.length === 0) return [];

  const route: Spot[] = [];
  const used = new Set<string>();
  const seenCategories = new Set<string>();

  const topWindow = Math.min(3, candidates.length);
  const first = candidates[variation % topWindow] as Spot;
  route.push(first);
  used.add(first.id);
  seenCategories.add(first.category);

  while (route.length < Math.min(count, candidates.length)) {
    const previous = route[route.length - 1] as Spot;
    let best: Spot | null = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      if (used.has(candidate.id)) continue;

      const distance = distanceMeters(
        { latitude: previous.latitude, longitude: previous.longitude },
        { latitude: candidate.latitude, longitude: candidate.longitude }
      );
      const distancePenalty = Math.min(distance / 1000, 18) * 0.22;
      const diversityBonus = seenCategories.has(candidate.category) ? 0 : 1.25;
      const rerollBias = ((candidate.id.length + variation) % 5) * 0.04;
      const candidateScore =
        scoreSpot(candidate, interests) +
        diversityBonus +
        rerollBias -
        distancePenalty;

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        best = candidate;
      }
    }

    if (!best) break;
    route.push(best);
    used.add(best.id);
    seenCategories.add(best.category);
  }

  return route;
}

function routeDistance(route: Spot[]) {
  let total = 0;

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1] as Spot;
    const current = route[index] as Spot;

    total += distanceMeters(
      { latitude: previous.latitude, longitude: previous.longitude },
      { latitude: current.latitude, longitude: current.longitude }
    );
  }

  return total;
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

  useEffect(() => {
    if (!visible) return;
    setRouteCity(selectedCity);
    setVariation(0);
    setSaved(false);
  }, [selectedCity, visible]);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;
  const raised = dark ? colors.darkSurfaceRaised : colors.lightMuted;

  const option = ROUTE_LENGTHS.find((item) => item.id === length) ?? ROUTE_LENGTHS[1]!;
  const eligible = useMemo(
    () => savedSpots.filter((spot) => spot.city === routeCity && spot.status !== 'visited'),
    [routeCity, savedSpots]
  );
  const route = useMemo(
    () => buildRoute(eligible, interests, option.places, variation),
    [eligible, interests, option.places, variation]
  );
  const totalDistance = useMemo(() => routeDistance(route), [route]);
  const distanceLabel = totalDistance >= 1000
    ? `≈ ${(totalDistance / 1000).toFixed(totalDistance >= 10_000 ? 0 : 1)} км между точками`
    : `≈ ${Math.max(0, totalDistance)} м между точками`;

  function rebuild() {
    setSaved(false);
    setVariation((current) => current + 1);
  }

  function saveAsCollection() {
    if (route.length < 2) return;

    const collection = createCollection({
      title: `Маршрут · ${CITY_LABELS[routeCity]}`,
      subtitle: `${option.label} · ${route.length} мест из моих спотов`,
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
    await Share.share({
      title: `Маршрут · ${CITY_LABELS[routeCity]}`,
      message: routeShareText(CITY_LABELS[routeCity], route)
    });
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
              СПОТ подберёт компактный план по сохранённым местам, любимым категориям и рейтингу.
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

        <View style={styles.lengthRow}>
          {ROUTE_LENGTHS.map((item) => {
            const active = item.id === length;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setLength(item.id);
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
                <View>
                  <Text style={[styles.summaryCity, { color: colors.green }]}>
                    {CITY_LABELS[routeCity].toUpperCase()}
                  </Text>
                  <Text style={[styles.summaryTitle, { color: text }]}>
                    {option.label} · {route.length} остановки
                  </Text>
                  <Text style={[styles.summaryDistance, { color: muted }]}>
                    {distanceLabel} · оценка по прямой
                  </Text>
                </View>
                <Pressable onPress={rebuild} style={[styles.rebuild, { backgroundColor: raised }]}>
                  <Text style={[styles.rebuildText, { color: text }]}>↻ Ещё</Text>
                </Pressable>
              </View>

              <View style={styles.routeList}>
                {route.map((spot, index) => (
                  <View key={spot.id} style={styles.routeRow}>
                    <View style={styles.timeline}>
                      <View style={styles.number}>
                        <Text style={styles.numberText}>{index + 1}</Text>
                      </View>
                      {index < route.length - 1 ? <View style={styles.line} /> : null}
                    </View>

                    <View style={[styles.placeCard, { backgroundColor: surface }]}>
                      <View style={styles.placeTop}>
                        <View style={styles.placeCopy}>
                          <Text style={[styles.placeMeta, { color: colors.green }]}>
                            {spot.categoryLabel.toUpperCase()}
                            {spot.favorite ? ' · ЛЮБИМОЕ' : ''}
                          </Text>
                          <Text style={[styles.placeName, { color: text }]}>{spot.name}</Text>
                          <Text style={[styles.placeAddress, { color: muted }]} numberOfLines={2}>
                            {spot.address}
                          </Text>
                        </View>
                        <Text style={[styles.rating, { color: text }]}>★ {spot.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
          <Pressable
            onPress={() => void shareRoute()}
            disabled={route.length < 2}
            style={[styles.secondary, { backgroundColor: surface }, route.length < 2 && styles.disabled]}
          >
            <Text style={[styles.secondaryText, { color: text }]}>↗ Поделиться</Text>
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
    paddingBottom: 130
  },
  summary: {
    minHeight: 86,
    borderRadius: 23,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
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
    fontSize: 10
  },
  rebuild: {
    marginLeft: 'auto',
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
    minHeight: 58,
    backgroundColor: '#2A3A31'
  },
  placeCard: {
    flex: 1,
    minHeight: 94,
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
  rating: {
    fontSize: 11,
    fontWeight: '900'
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
    paddingTop: 12,
    paddingBottom: 28,
    flexDirection: 'row',
    gap: 10
  },
  secondary: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryText: {
    fontSize: 12,
    fontWeight: '900'
  },
  primary: {
    flex: 1.25,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '900'
  },
  disabled: {
    opacity: 0.35
  }
});
