import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { CategoryChip } from '../components/CategoryChip';
import { SpotCard } from '../components/SpotCard';
import { categories, spots } from '../data/mock';
import { colors } from '../theme';

export function MapScreen() {
  const dark = useColorScheme() === 'dark';
  const [category, setCategory] = useState<(typeof categories)[number]['id']>('all');
  const filtered = useMemo(
    () => category === 'all' ? spots : spots.filter((spot) => spot.category === category),
    [category]
  );
  const nearby = filtered[0] ?? spots[0];

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <View style={styles.map}>
        <View style={[styles.road, styles.roadOne]} />
        <View style={[styles.road, styles.roadTwo]} />
        <View style={[styles.road, styles.roadThree]} />

        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>СПОТ</Text>
            <Text style={styles.city}>Санкт-Петербург⌄</Text>
          </View>
          <View style={styles.searchButton}><Text style={styles.searchText}>⌕</Text></View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {categories.map((item) => (
            <CategoryChip
              key={item.id}
              label={item.label}
              active={category === item.id}
              onPress={() => setCategory(item.id)}
            />
          ))}
        </ScrollView>

        <View style={[styles.pin, { top: '42%', left: '24%' }]}><Text style={styles.pinHeart}>♥</Text></View>
        <View style={[styles.pin, styles.pinSmall, { top: '52%', right: '20%' }]}><Text style={styles.pinHeart}>♥</Text></View>
        <View style={[styles.cluster, { top: '33%', right: '35%' }]}><Text style={styles.clusterText}>7</Text></View>

        <View style={styles.nearbyPill}>
          <Text style={styles.nearbyStrong}>{filtered.length || spots.length} спота рядом</Text>
          <Text style={styles.nearbyMuted}>в пределах 2 км</Text>
        </View>
      </View>

      {nearby && (
        <View style={styles.bottomCard}>
          <SpotCard spot={nearby} compact />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: {
    flex: 1,
    backgroundColor: '#111714',
    overflow: 'hidden'
  },
  road: {
    position: 'absolute',
    height: 7,
    borderRadius: 8,
    backgroundColor: '#2B332F',
    opacity: 0.86
  },
  roadOne: { width: '130%', top: '42%', left: '-15%', transform: [{ rotate: '-18deg' }] },
  roadTwo: { width: '120%', top: '62%', left: '-10%', transform: [{ rotate: '11deg' }] },
  roadThree: { width: '96%', top: '35%', left: '18%', transform: [{ rotate: '68deg' }] },
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
    letterSpacing: -0.6
  },
  searchButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#202723',
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchText: { color: colors.white, fontSize: 28, marginTop: -4 },
  filters: {
    position: 'absolute',
    top: 122,
    left: 0,
    paddingHorizontal: 20,
    gap: 8,
    zIndex: 4
  },
  pin: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8
  },
  pinSmall: {
    width: 40,
    height: 40,
    borderRadius: 20
  },
  pinHeart: {
    color: colors.black,
    fontSize: 20
  },
  cluster: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center'
  },
  clusterText: {
    color: colors.black,
    fontWeight: '900',
    fontSize: 15
  },
  nearbyPill: {
    position: 'absolute',
    left: 20,
    bottom: 176,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: 'rgba(11,15,12,0.88)'
  },
  nearbyStrong: { color: colors.white, fontSize: 14, fontWeight: '800' },
  nearbyMuted: { color: '#98A39D', fontSize: 12, marginTop: 2 },
  bottomCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14
  }
});
