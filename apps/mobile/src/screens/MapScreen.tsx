import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, type Region } from 'react-native-maps';

import { CategoryChip } from '../components/CategoryChip';
import { PlaceDetailModal } from '../components/PlaceDetailModal';
import { SpotCard } from '../components/SpotCard';
import { categories, spots } from '../data/mock';
import { colors } from '../theme';
import type { Spot } from '../types';

const SPB_REGION: Region = {
  latitude: 59.9386,
  longitude: 30.3141,
  latitudeDelta: 0.085,
  longitudeDelta: 0.085
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
  const [category, setCategory] = useState<(typeof categories)[number]['id']>('all');
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

  const filtered = useMemo(
    () => category === 'all' ? spots : spots.filter((spot) => spot.category === category),
    [category]
  );

  const nearby = selectedSpot ?? filtered[0] ?? spots[0];

  async function moveToUser() {
    if (locationBusy) return;
    setLocationBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      mapRef.current?.animateToRegion({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025
      }, 450);
    } finally {
      setLocationBusy(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={SPB_REGION}
        customMapStyle={dark ? darkMapStyle : []}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        onPress={() => setSelectedSpot(null)}
      >
        {filtered.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            onPress={(event) => {
              event.stopPropagation();
              setSelectedSpot(spot);
            }}
          >
            <View style={[styles.pin, selectedSpot?.id === spot.id && styles.pinSelected]}>
              <Text style={styles.pinHeart}>♥</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>СПОТ</Text>
          <Text style={styles.city}>Санкт-Петербург⌄</Text>
        </View>
        <Pressable style={styles.searchButton}>
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

      <Pressable onPress={moveToUser} style={styles.locationButton}>
        <Text style={styles.locationIcon}>{locationBusy ? '…' : '⌖'}</Text>
      </Pressable>

      <View style={styles.nearbyPill}>
        <Text style={styles.nearbyStrong}>{filtered.length} {filtered.length === 1 ? 'спот' : 'спота'} рядом</Text>
        <Text style={styles.nearbyMuted}>сохранённые места</Text>
      </View>

      {nearby && (
        <View style={styles.bottomCard}>
          <SpotCard
            spot={nearby}
            compact
            onPress={() => setSelectedSpot(nearby)}
          />
        </View>
      )}

      <PlaceDetailModal
        spot={selectedSpot}
        visible={Boolean(selectedSpot)}
        onClose={() => setSelectedSpot(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
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
  }
});
