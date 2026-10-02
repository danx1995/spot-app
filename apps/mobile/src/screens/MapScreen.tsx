import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, type Region } from 'react-native-maps';

import { CategoryChip } from '../components/CategoryChip';
import { DiscoverySheet } from '../components/DiscoverySheet';
import { MapSearchSheet } from '../components/MapSearchSheet';
import { NearbySheet } from '../components/NearbySheet';
import { PlaceDetailModal } from '../components/PlaceDetailModal';
import { SpotCard } from '../components/SpotCard';
import { categories } from '../data/mock';
import { searchPlaces } from '../services/api';
import { getSharedPlace } from '../services/libraryApi';
import { useInboundImport } from '../state/InboundImport';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { CitySlug, DiscoveryInterest, Spot, SpotCategory } from '../types';
import { distanceMeters, spotWithDistance, type Coordinates } from '../utils/geo';

const NEARBY_RADIUS_METERS = 2000;

type MapCategory = (typeof categories)[number]['id'];
type DiscoverCategory = Exclude<MapCategory, 'all'>;

const DISCOVERY_QUERIES: Record<DiscoverCategory, string> = {
  restaurant: 'ресторан',
  coffee: 'кофейня',
  bar: 'бар',
  hotel: 'отель',
  culture: 'музей'
};

const DISCOVERY_LABELS: Record<DiscoverCategory, string> = {
  restaurant: 'Еда',
  coffee: 'Кофе',
  bar: 'Бары',
  hotel: 'Отели',
  culture: 'Культура'
};

const CITY_REGIONS: Record<CitySlug, Region> = {
  spb: {
    latitude: 59.9386,
    longitude: 30.3141,
    latitudeDelta: 0.085,
    longitudeDelta: 0.085
  },
  moscow: {
    latitude: 55.7558,
    longitude: 37.6173,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12
  }
};

const CITY_LABELS: Record<CitySlug, string> = {
  spb: 'Санкт-Петербург',
  moscow: 'Москва'
};

const PERSONALIZED_DISCOVERY_LIMIT = 10;

function personalizedCategoriesFor(
  interests: DiscoveryInterest[],
  saved: Spot[]
): DiscoverCategory[] {
  const counts = new Map<DiscoverCategory, number>();

  for (const interest of interests) {
    counts.set(interest, (counts.get(interest) ?? 0) + 100);
  }
  for (const spot of saved) {
    if (!(spot.category in DISCOVERY_QUERIES)) continue;
    const category = spot.category as DiscoverCategory;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const ranked = (Object.keys(DISCOVERY_QUERIES) as DiscoverCategory[])
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));

  return ranked.slice(0, 2);
}

function rankPersonalizedSpots(
  spots: Spot[],
  preferred: DiscoverCategory[]
) {
  const order = new Map(preferred.map((category, index) => [category, index]));

  return [...spots]
    .sort((a, b) => {
      const aPreference = order.has(a.category as DiscoverCategory)
        ? 3 - (order.get(a.category as DiscoverCategory) ?? 0)
        : 0;
      const bPreference = order.has(b.category as DiscoverCategory)
        ? 3 - (order.get(b.category as DiscoverCategory) ?? 0)
        : 0;

      const aScore =
        a.rating * 2 +
        Math.log10((a.reviewCount ?? 0) + 1) * 0.6 +
        aPreference -
        Math.min(a.distanceMeters / 1000, 10) * 0.08;
      const bScore =
        b.rating * 2 +
        Math.log10((b.reviewCount ?? 0) + 1) * 0.6 +
        bPreference -
        Math.min(b.distanceMeters / 1000, 10) * 0.08;

      return bScore - aScore;
    })
    .slice(0, PERSONALIZED_DISCOVERY_LIMIT);
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#151A17' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8C968F' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#151A17' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#171D19' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#657069' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A312D' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#343C37' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0D1714' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#53615B' }] }
];

export function MapScreen() {
  const dark = useColorScheme() === 'dark';
  const mapRef = useRef<MapView | null>(null);
  const skipNextCityResetRef = useRef(false);
  const { pendingPlaceID, consumePendingPlace } = useInboundImport();
  const { savedSpots, selectedCity, setSelectedCity, interests } = useSpotStore();
  const [category, setCategory] = useState<MapCategory>('all');
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [forYouOpen, setForYouOpen] = useState(false);
  const [forYouSpots, setForYouSpots] = useState<Spot[]>([]);
  const [forYouLoading, setForYouLoading] = useState(false);
  const [forYouError, setForYouError] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(CITY_REGIONS.spb);
  const [discoveredSpots, setDiscoveredSpots] = useState<Spot[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [lastDiscoveryCenter, setLastDiscoveryCenter] = useState<Coordinates | null>(null);
  const [sharedPlaceError, setSharedPlaceError] = useState<string | null>(null);

  const personalizedCategories = useMemo(() => {
    const all = categories.find((item) => item.id === 'all');
    const order = new Map<DiscoveryInterest, number>(
      interests.map((interest, index) => [interest, index])
    );

    const sorted = categories
      .filter((item) => item.id !== 'all')
      .map((item, index) => ({
        item,
        index,
        interestOrder: order.get(item.id as DiscoveryInterest)
      }))
      .sort((a, b) => {
        if (a.interestOrder !== undefined && b.interestOrder !== undefined) {
          return a.interestOrder - b.interestOrder;
        }
        if (a.interestOrder !== undefined) return -1;
        if (b.interestOrder !== undefined) return 1;
        return a.index - b.index;
      })
      .map(({ item }) => item);

    return all ? [all, ...sorted] : sorted;
  }, [interests]);

  const citySpots = useMemo(
    () => savedSpots
      .filter((spot) => spot.city === selectedCity)
      .map((spot) => userLocation ? spotWithDistance(spot, userLocation) : spot),
    [savedSpots, selectedCity, userLocation]
  );

  const filtered = useMemo(() => {
    const visible = citySpots.filter((spot) => category === 'all' || spot.category === category);
    if (!userLocation) return visible;
    return [...visible].sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [category, citySpots, userLocation]);

  const nearbySpots = useMemo(() => {
    if (!userLocation) return [];
    return citySpots
      .filter((spot) => spot.distanceMeters <= NEARBY_RADIUS_METERS)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [citySpots, userLocation]);

  const selectedSpotWithDistance = useMemo(
    () => selectedSpot && userLocation ? spotWithDistance(selectedSpot, userLocation) : selectedSpot,
    [selectedSpot, userLocation]
  );

  const visibleDiscovered = useMemo(
    () => discoveredSpots
      .filter((spot) => spot.city === selectedCity)
      .filter((spot) => category === 'all' || spot.category === category)
      .map((spot) => userLocation ? spotWithDistance(spot, userLocation) : spot),
    [category, discoveredSpots, selectedCity, userLocation]
  );

  const markerSpots = useMemo(() => {
    const byID = new Map<string, Spot>();

    for (const spot of visibleDiscovered) {
      byID.set(spot.id, spot);
    }
    for (const spot of filtered) {
      byID.set(spot.id, spot);
    }

    if (selectedSpotWithDistance) {
      const saved = filtered.find((spot) => spot.id === selectedSpotWithDistance.id);
      byID.set(selectedSpotWithDistance.id, saved ?? selectedSpotWithDistance);
    }

    return Array.from(byID.values());
  }, [filtered, selectedSpotWithDistance, visibleDiscovered]);

  const nearby = selectedSpotWithDistance ?? filtered[0] ?? visibleDiscovered[0];


  const mapMovedSinceDiscovery = useMemo(() => {
    if (!lastDiscoveryCenter) return false;
    return distanceMeters(lastDiscoveryCenter, {
      latitude: mapRegion.latitude,
      longitude: mapRegion.longitude
    }) > 250;
  }, [lastDiscoveryCenter, mapRegion.latitude, mapRegion.longitude]);

  useEffect(() => {
    if (!pendingPlaceID) return;

    let active = true;
    setSharedPlaceError(null);

    void getSharedPlace(pendingPlaceID)
      .then((spot) => {
        if (!active) return;

        if (spot.city !== selectedCity) {
          skipNextCityResetRef.current = true;
          setSelectedCity(spot.city);
        }

        setSelectedSpot(spot);
        const region = {
          latitude: spot.latitude,
          longitude: spot.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02
        };
        setMapRegion(region);
        mapRef.current?.animateToRegion(region, 450);
      })
      .catch((reason) => {
        if (!active) return;
        setSharedPlaceError(
          reason instanceof Error ? reason.message : 'Не удалось открыть место'
        );
      })
      .finally(() => {
        if (active) consumePendingPlace();
      });

    return () => {
      active = false;
    };
  }, [consumePendingPlace, pendingPlaceID, selectedCity, setSelectedCity]);

  useEffect(() => {
    if (skipNextCityResetRef.current) {
      skipNextCityResetRef.current = false;
      return;
    }

    const region = CITY_REGIONS[selectedCity];
    setSelectedSpot(null);
    setNearbyOpen(false);
    setDiscoveryOpen(false);
    setForYouOpen(false);
    setForYouSpots([]);
    setForYouError(null);
    setDiscoveredSpots([]);
    setDiscoverError(null);
    setLastDiscoveryCenter(null);
    setMapRegion(region);
    mapRef.current?.animateToRegion(region, 450);
  }, [selectedCity]);

  async function moveToUser() {
    if (locationBusy) return;
    setLocationBusy(true);
    setLocationDenied(false);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationDenied(true);
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      const coordinate = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      };
      const region = {
        ...coordinate,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025
      };

      setUserLocation(coordinate);
      setMapRegion(region);
      mapRef.current?.animateToRegion(region, 450);
    } catch {
      setLocationDenied(true);
    } finally {
      setLocationBusy(false);
    }
  }

  async function discoverForYou() {
    if (forYouLoading) return;

    setForYouLoading(true);
    setForYouError(null);

    try {
      const preferred = personalizedCategoriesFor(interests, citySpots);
      const center = {
        latitude: mapRegion.latitude,
        longitude: mapRegion.longitude
      };

      const batches = await Promise.all(
        preferred.map((item) => searchPlaces(
          DISCOVERY_QUERIES[item],
          selectedCity,
          {
            latitude: center.latitude,
            longitude: center.longitude,
            category: item as SpotCategory
          }
        ))
      );

      const savedIDs = new Set(savedSpots.map((spot) => spot.id));
      const byID = new Map<string, Spot>();

      for (const spot of batches.flat()) {
        if (savedIDs.has(spot.id)) continue;
        byID.set(spot.id, spotWithDistance(spot, center));
      }

      const ranked = rankPersonalizedSpots(Array.from(byID.values()), preferred);
      setForYouSpots(ranked);

      if (ranked.length === 0) {
        setForYouError('Пока не нашли новые места под твои интересы в этой области');
        return;
      }

      setForYouOpen(true);
    } catch {
      setForYouError('Не удалось собрать рекомендации');
    } finally {
      setForYouLoading(false);
    }
  }

  async function discoverHere() {
    if (category === 'all' || discovering) return;

    setDiscovering(true);
    setDiscoverError(null);

    try {
      const center = {
        latitude: mapRegion.latitude,
        longitude: mapRegion.longitude
      };
      const places = await searchPlaces(
        DISCOVERY_QUERIES[category],
        selectedCity,
        {
          latitude: center.latitude,
          longitude: center.longitude,
          category: category as SpotCategory
        }
      );
      const withDistance = places.map((spot) => spotWithDistance(spot, center));

      setDiscoveredSpots(withDistance);
      setLastDiscoveryCenter(center);

      if (withDistance.length > 0) {
        const first = withDistance[0];
        if (first) setSelectedSpot(first);
      } else {
        setSelectedSpot(null);
        setDiscoverError('В этой части карты ничего не нашли');
      }
    } catch {
      setDiscoverError('Не удалось загрузить места');
    } finally {
      setDiscovering(false);
    }
  }

  function toggleCity() {
    setSelectedCity(selectedCity === 'spb' ? 'moscow' : 'spb');
  }

  function focusSpot(spot: Spot) {
    setSelectedSpot(spot);
    const region = {
      latitude: spot.latitude,
      longitude: spot.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02
    };
    setMapRegion(region);
    mapRef.current?.animateToRegion(region, 450);
  }

  function openNearby() {
    if (!userLocation) {
      void moveToUser();
      return;
    }
    setNearbyOpen(true);
  }

  const discoveryText = category === 'all'
    ? ''
    : discoverError
      ? 'Повторить поиск здесь'
      : discoveredSpots.length > 0 && !mapMovedSinceDiscovery
        ? `${discoveredSpots.length} мест · посмотреть`
        : mapMovedSinceDiscovery
          ? 'Искать в этой области'
          : `Найти рядом: ${DISCOVERY_LABELS[category]}`;

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={CITY_REGIONS[selectedCity]}
        customMapStyle={dark ? darkMapStyle : []}
        showsUserLocation={Boolean(userLocation)}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        onRegionChangeComplete={setMapRegion}
        onPress={() => setSelectedSpot(null)}
      >
        {markerSpots.map((spot) => {
          const saved = savedSpots.some((item) => item.id === spot.id);
          const selected = selectedSpotWithDistance?.id === spot.id;

          return (
            <Marker
              key={spot.id}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              onPress={(event) => {
                event.stopPropagation();
                setSelectedSpot(spot);
              }}
            >
              <View style={[
                styles.pin,
                !saved && styles.searchPin,
                selected && styles.pinSelected
              ]}>
                <Text style={styles.pinHeart}>{saved ? '♥' : '+'}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>СПОТ</Text>
          <Pressable onPress={toggleCity}>
            <Text style={styles.city}>{CITY_LABELS[selectedCity]}⌄</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setSearchOpen(true)} style={styles.searchButton}>
          <Text style={styles.searchText}>⌕</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroller}
        contentContainerStyle={styles.filters}
      >
        <Pressable
          onPress={() => void discoverForYou()}
          disabled={forYouLoading}
          style={[styles.forYouChip, forYouLoading && styles.forYouChipBusy]}
        >
          {forYouLoading ? (
            <ActivityIndicator color={colors.black} size="small" />
          ) : (
            <Text style={styles.forYouChipIcon}>✦</Text>
          )}
          <Text style={styles.forYouChipText}>Для тебя</Text>
        </Pressable>

        {personalizedCategories.map((item) => (
          <CategoryChip
            key={item.id}
            label={item.label}
            active={category === item.id}
            onPress={() => {
              setCategory(item.id);
              setSelectedSpot(null);
              setDiscoveryOpen(false);
              setDiscoveredSpots([]);
              setDiscoverError(null);
              setLastDiscoveryCenter(null);
            }}
          />
        ))}
      </ScrollView>

      {category !== 'all' ? (
        <Pressable
          onPress={() => {
            if (discoveredSpots.length > 0 && !mapMovedSinceDiscovery && !discoverError) {
              setDiscoveryOpen(true);
              return;
            }
            void discoverHere();
          }}
          disabled={discovering}
          style={[styles.discoverButton, discovering && styles.discoverButtonBusy]}
        >
          {discovering ? (
            <ActivityIndicator color={colors.black} size="small" />
          ) : (
            <Text style={styles.discoverIcon}>⌖</Text>
          )}
          <Text style={styles.discoverText}>
            {discovering ? 'Ищем места…' : discoveryText}
          </Text>
        </Pressable>
      ) : null}

      <Pressable onPress={() => void moveToUser()} style={styles.locationButton}>
        <Text style={styles.locationIcon}>{locationBusy ? '…' : '⌖'}</Text>
      </Pressable>

      <Pressable onPress={openNearby} style={styles.nearbyPill}>
        <Text style={styles.nearbyStrong}>
          {userLocation
            ? `${nearbySpots.length} ${nearbySpots.length === 1 ? 'спот' : 'спота'} рядом`
            : locationDenied
              ? 'Геолокация недоступна'
              : 'Показать споты рядом'}
        </Text>
        <Text style={styles.nearbyMuted}>
          {userLocation
            ? `до ${NEARBY_RADIUS_METERS / 1000} км · нажми для списка`
            : locationDenied
              ? 'разрешение можно изменить в настройках телефона'
              : 'геолокация включается только по запросу'}
        </Text>
      </Pressable>

      {forYouError ? (
        <Pressable
          onPress={() => setForYouError(null)}
          style={styles.forYouError}
        >
          <Text style={styles.forYouErrorTitle}>Для тебя</Text>
          <Text style={styles.forYouErrorText}>{forYouError}</Text>
        </Pressable>
      ) : null}

      {sharedPlaceError ? (
        <Pressable
          onPress={() => setSharedPlaceError(null)}
          style={styles.sharedError}
        >
          <Text style={styles.sharedErrorTitle}>Ссылка недоступна</Text>
          <Text style={styles.sharedErrorText}>{sharedPlaceError}</Text>
        </Pressable>
      ) : null}

      {nearby ? (
        <View style={styles.bottomCard}>
          <SpotCard spot={nearby} compact onPress={() => setSelectedSpot(nearby)} />
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Здесь пока нет спотов</Text>
          <Text style={styles.emptyText}>
            Выбери категорию и нажми «Найти рядом» или добавь место через зелёную кнопку «+».
          </Text>
        </View>
      )}

      <DiscoverySheet
        visible={forYouOpen}
        spots={forYouSpots}
        categoryLabel="Для тебя"
        onClose={() => setForYouOpen(false)}
        onSelect={focusSpot}
      />

      <DiscoverySheet
        visible={discoveryOpen}
        spots={visibleDiscovered}
        categoryLabel={category === 'all' ? 'Места' : DISCOVERY_LABELS[category]}
        onClose={() => setDiscoveryOpen(false)}
        onSelect={focusSpot}
      />

      <MapSearchSheet
        visible={searchOpen}
        city={selectedCity}
        onClose={() => setSearchOpen(false)}
        onSelect={focusSpot}
      />

      <NearbySheet
        visible={nearbyOpen}
        spots={nearbySpots}
        radiusMeters={NEARBY_RADIUS_METERS}
        onClose={() => setNearbyOpen(false)}
        onSelect={focusSpot}
      />

      <PlaceDetailModal
        spot={selectedSpotWithDistance}
        visible={Boolean(selectedSpotWithDistance)}
        onClose={() => setSelectedSpot(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: 'absolute',
    zIndex: 3,
    top: 56,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  eyebrow: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2
  },
  city: {
    marginTop: 3,
    color: colors.white,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 8
  },
  searchButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(17,23,20,0.93)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchText: {
    color: colors.white,
    fontSize: 28,
    marginTop: -4
  },
  filterScroller: {
    position: 'absolute',
    top: 122,
    left: 0,
    right: 0,
    zIndex: 4
  },
  filters: {
    paddingHorizontal: 20,
    gap: 8
  },
  forYouChip: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: colors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  forYouChipBusy: {
    opacity: 0.75
  },
  forYouChipIcon: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '900'
  },
  forYouChipText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: '900'
  },
  discoverButton: {
    position: 'absolute',
    zIndex: 5,
    top: 174,
    alignSelf: 'center',
    minHeight: 44,
    maxWidth: '86%',
    paddingHorizontal: 15,
    borderRadius: 18,
    backgroundColor: colors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: colors.black,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6
  },
  discoverButtonBusy: {
    opacity: 0.82
  },
  discoverIcon: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '900'
  },
  discoverText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '900'
  },
  pin: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.green,
    borderWidth: 3,
    borderColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchPin: {
    backgroundColor: colors.white,
    borderColor: colors.green
  },
  pinSelected: {
    width: 50,
    height: 50,
    borderRadius: 25,
    shadowColor: colors.green,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8
  },
  pinHeart: {
    color: colors.black,
    fontSize: 18,
    fontWeight: '900'
  },
  locationButton: {
    position: 'absolute',
    right: 18,
    bottom: 190,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(11,15,12,0.92)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  locationIcon: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800'
  },
  nearbyPill: {
    position: 'absolute',
    left: 18,
    bottom: 188,
    maxWidth: '72%',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(11,15,12,0.90)'
  },
  nearbyStrong: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800'
  },
  nearbyMuted: {
    color: '#98A39D',
    fontSize: 11,
    marginTop: 2
  },
  forYouError: {
    position: 'absolute',
    zIndex: 7,
    left: 18,
    right: 18,
    bottom: 205,
    borderRadius: 18,
    backgroundColor: 'rgba(11,15,12,0.95)',
    borderWidth: 1,
    borderColor: '#19C37D55',
    padding: 14
  },
  forYouErrorTitle: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '900'
  },
  forYouErrorText: {
    marginTop: 3,
    color: '#A5AEA8',
    fontSize: 10,
    lineHeight: 15
  },
  sharedError: {
    position: 'absolute',
    zIndex: 7,
    left: 18,
    right: 18,
    bottom: 205,
    borderRadius: 18,
    backgroundColor: 'rgba(11,15,12,0.95)',
    borderWidth: 1,
    borderColor: '#EB575755',
    padding: 14
  },
  sharedErrorTitle: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '900'
  },
  sharedErrorText: {
    marginTop: 3,
    color: '#A5AEA8',
    fontSize: 10,
    lineHeight: 15
  },
  bottomCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14
  },
  emptyCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(11,15,12,0.94)',
    padding: 18
  },
  emptyTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900'
  },
  emptyText: {
    marginTop: 4,
    color: '#98A39D',
    fontSize: 13,
    lineHeight: 18
  }
});
