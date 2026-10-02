import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '../components/BrandMark';
import { colors } from '../theme';

type OnboardingCity = 'spb' | 'moscow' | 'both';

type Props = {
  onComplete: (city: OnboardingCity) => void;
};

export function OnboardingScreen({ onComplete }: Props) {
  const [city, setCity] = useState<OnboardingCity>('spb');

  return (
    <View style={styles.root}>
      <BrandMark size={60} inverted />

      <View style={styles.copy}>
        <Text style={styles.title}>Все места, куда хочется попасть.</Text>
        <Text style={styles.subtitle}>Рестораны, кофе, бары, отели и любимые точки — в одной личной карте.</Text>
      </View>

      <View style={styles.cityBlock}>
        <Text style={styles.sectionLabel}>С чего начнём?</Text>
        <View style={styles.cityRow}>
          {([
            ['spb', 'Петербург'],
            ['moscow', 'Москва'],
            ['both', 'Оба']
          ] as const).map(([id, label]) => {
            const active = city === id;
            return (
              <Pressable
                key={id}
                onPress={() => setCity(id)}
                style={[styles.cityButton, active && styles.cityButtonActive]}
              >
                <Text style={[styles.cityText, active && styles.cityTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable onPress={() => onComplete(city)} style={styles.primaryButton}>
        <Text style={styles.primaryText}>Открыть СПОТ</Text>
      </Pressable>

      <Text style={styles.privacy}>Геолокацию можно включить позже — она нужна только для функции «рядом».</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
    paddingTop: 78,
    paddingHorizontal: 24,
    paddingBottom: 36
  },
  copy: {
    marginTop: 72
  },
  title: {
    color: colors.white,
    fontSize: 42,
    lineHeight: 45,
    fontWeight: '900',
    letterSpacing: -1.8
  },
  subtitle: {
    color: '#9CA7A1',
    marginTop: 16,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 340
  },
  cityBlock: {
    marginTop: 'auto'
  },
  sectionLabel: {
    color: '#8F9994',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10
  },
  cityRow: {
    flexDirection: 'row',
    gap: 8
  },
  cityButton: {
    flex: 1,
    height: 48,
    borderRadius: 17,
    backgroundColor: colors.darkSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cityButtonActive: {
    backgroundColor: colors.green
  },
  cityText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800'
  },
  cityTextActive: {
    color: colors.black
  },
  primaryButton: {
    marginTop: 14,
    minHeight: 58,
    borderRadius: 19,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '900'
  },
  privacy: {
    marginTop: 14,
    color: '#78827C',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center'
  }
});
