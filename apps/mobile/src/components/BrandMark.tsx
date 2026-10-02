import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Props = {
  size?: number;
  inverted?: boolean;
};

export function BrandMark({ size = 56, inverted = false }: Props) {
  const pinSize = Math.round(size * 0.8);
  return (
    <View style={styles.row}>
      <Text style={[styles.word, { fontSize: size * 0.68, color: inverted ? colors.white : colors.black }]}>
        СП
      </Text>
      <View style={[styles.pin, { width: pinSize, height: pinSize, borderRadius: pinSize / 2 }]}>
        <Text style={[styles.heart, { fontSize: pinSize * 0.42 }]}>♥</Text>
      </View>
      <Text style={[styles.word, { fontSize: size * 0.68, color: inverted ? colors.white : colors.black }]}>
        Т
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  word: {
    fontWeight: '800',
    letterSpacing: -1.8
  },
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
    transform: [{ rotate: '45deg' }]
  },
  heart: {
    color: colors.black,
    transform: [{ rotate: '-45deg' }],
    marginTop: -1
  }
});
