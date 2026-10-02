import React from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors } from '../theme';
import type { Spot } from '../types';

function formatDistance(meters: number) {
  if (meters < 1000) return `${meters} м`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} км`;
}

type Props = {
  spot: Spot;
  compact?: boolean;
  onPress?: () => void;
};

export function SpotCard({ spot, compact = false, onPress }: Props) {
  const dark = useColorScheme() === 'dark';
  const card = dark ? colors.darkSurface : colors.white;
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compact,
        { backgroundColor: card, opacity: pressed ? 0.94 : 1 }
      ]}
    >
      <View style={styles.cover}>
        <View style={styles.coverGlow} />
        <Text style={styles.coverSymbol}>
          {spot.category === 'hotel' ? 'H' : spot.category === 'coffee' ? 'C' : spot.category === 'park' ? 'P' : 'S'}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleArea}>
            <Text numberOfLines={1} style={[styles.name, { color: text }]}>{spot.name}</Text>
            <Text style={[styles.meta, { color: muted }]}>
              {spot.categoryLabel} · {formatDistance(spot.distanceMeters)}
            </Text>
          </View>
          <Text style={[styles.heart, { color: spot.favorite ? colors.green : muted }]}>
            {spot.favorite ? '♥' : '♡'}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text style={[styles.address, { color: muted }]} numberOfLines={1}>{spot.address}</Text>
          <Text style={[styles.rating, { color: text }]}>★ {spot.rating.toFixed(1)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: 'hidden'
  },
  compact: {
    flexDirection: 'row'
  },
  cover: {
    height: 150,
    minWidth: 122,
    backgroundColor: '#17231D',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  coverGlow: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#214F3B',
    opacity: 0.78
  },
  coverSymbol: {
    color: colors.green,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -3
  },
  body: {
    flex: 1,
    padding: 16,
    gap: 16
  },
  topRow: {
    flexDirection: 'row',
    gap: 12
  },
  titleArea: {
    flex: 1
  },
  name: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4
  },
  meta: {
    marginTop: 4,
    fontSize: 14
  },
  heart: {
    fontSize: 24,
    lineHeight: 28
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  address: {
    flex: 1,
    fontSize: 13
  },
  rating: {
    fontSize: 13,
    fontWeight: '700'
  }
});
