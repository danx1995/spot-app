import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, type Region } from 'react-native-maps';

import { CategoryChip } from '../components/CategoryChip';
import { MapSearchSheet } from '../components/MapSearchSheet';
import { NearbySheet } from '../components/NearbySheet';
import { PlaceDetailModal } from '../components/PlaceDetailModal';
import { SpotCard } from '../components/SpotCard';
import { categories } from '../data/mock';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { CitySlug, Spot } from '../types';
import { spotWithDistance, type Coordinates } from '../utils/geo';

const NEARBY_RADIUS_METERS = 2000;

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
  const { savedSpots, selectedCity, setSelectedCity } = useSpotStore();
  const [category, setCategory] = useState<(typeof categories)[number]['id']>('all');
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);

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

  const markerSpots = useMemo(() => {
    if (!selectedSpotWithDistance || savedSpots.some((spot) => spot.id === selectedSpotWithDistance.id)) {
      return filtered;
    }
    return [selectedSpotWithDistance, ...filtered];
  }, [filtered, savedSpots, selectedSpotWithDistance]);

  const nearby = selectedSpotWithDistance ?? filtered[0];

  useEffect(() => {
    setSelectedSpot(null);
    setNearbyOpen(false);
    mapRef.current?.animateToRegion(CITY_REGIONS[selectedCity], 450);
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

      setUserLocation(coordinate);
      mapRef.current?.animateToRegion({
        ...coordinate,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025
      }, 450);
    } catch {
      setLocationDenied(true);
    } finally {
      setLocationBusy(false);
    }
  }

  function toggleCity() {
    setSelectedCity(selectedCity === 'spb' ? 'moscow' : 'spb');
  }

  function focusSpot(spot: Spot) {
    setSelectedSpot(spot);
    mapRef.current?.animateToRegion({
      latitude: spot.latitude,
      longitude: spot.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02
    }, 450);
  }

  function openNearby() {
    if (!userLocation) {
      void moveToUser();
      return;
    }
    setNearbyOpen(true);
  }

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
        {categories.map((item) => (
          <CategoryChip
            key={item.id}
            label={item.label}
            active={category === item.id}
            onPress={() => {
              setCategory(item.id);
              setSelectedSpot(null);
            }}
          />
        ))}
      </ScrollView>

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

      {nearby ? (
        <View style={styles.bottomCard}>
          <SpotCard spot={nearby} compact onPress={() => setSelectedSpot(nearby)} />
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Здесь пока нет спотов</Text>
          <Text style={styles.emptyText}>Найди место через поиск или добавь его через зелёную кнопку «+».</Text>
        </View>
      )}

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
    fontSize: 13
  }
});
