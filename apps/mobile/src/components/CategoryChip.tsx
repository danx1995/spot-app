import React from 'react';
import { Pressable, StyleSheet, Text, useColorScheme } from 'react-native';
import { colors } from '../theme';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

export function CategoryChip({ label, active, onPress }: Props) {
  const dark = useColorScheme() === 'dark';
  const backgroundColor = active
    ? colors.green
    : dark
      ? colors.darkSurfaceRaised
      : colors.white;

  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor }]}>
      <Text style={[styles.label, { color: active ? colors.black : dark ? colors.white : colors.black }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center'
  },
  label: {
    fontSize: 14,
    fontWeight: '700'
  }
});
