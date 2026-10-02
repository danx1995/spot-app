import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors } from '../theme';
import type { Spot, SpotStatus } from '../types';

type Props = {
  spot: Spot | null;
  visible: boolean;
  onClose: () => void;
};

const statusCopy: Record<SpotStatus, string> = {
  want: 'Хочу сюда',
  visited: 'Был здесь',
  booked: 'Забронировано'
};

export function PlaceDetailModal({ spot, visible, onClose }: Props) {
  const dark = useColorScheme() === 'dark';
  const [overrideStatus, setOverrideStatus] = useState<SpotStatus | null>(null);
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  const status = useMemo(() => overrideStatus ?? spot?.status ?? 'want', [overrideStatus, spot?.status]);

  if (!spot) return null;

  const primaryLabel = spot.category === 'hotel' && status === 'want'
    ? 'Хочу остановиться'
    : statusCopy[status];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroLetter}>{spot.category === 'hotel' ? 'H' : 'S'}</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.category, { color: colors.green }]}>{spot.categoryLabel.toUpperCase()}</Text>
          <Text style={[styles.title, { color: text }]}>{spot.name}</Text>
          <Text style={[styles.meta, { color: muted }]}>★ {spot.rating.toFixed(1)} · {spot.address}</Text>

          <View style={styles.actions}>
            <Pressable
              onPress={() => setOverrideStatus(status === 'want' ? 'visited' : 'want')}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryText}>{status === 'visited' ? '✓ Был здесь' : `♥ ${primaryLabel}`}</Text>
            </Pressable>
            <Pressable style={[styles.secondaryButton, { backgroundColor: surface }]}>
              <Text style={[styles.secondaryText, { color: text }]}>Маршрут</Text>
            </Pressable>
          </View>

          <View style={[styles.block, { backgroundColor: surface }]}>
            <Text style={[styles.blockLabel, { color: muted }]}>ПОЧЕМУ СОХРАНЕНО</Text>
            <Text style={[styles.note, { color: text }]}>{spot.note ?? 'Добавь заметку, чтобы потом вспомнить, почему захотелось сюда попасть.'}</Text>
          </View>

          <View style={[styles.block, { backgroundColor: surface }]}>
            <Text style={[styles.blockLabel, { color: muted }]}>О МЕСТЕ</Text>
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: muted }]}>Город</Text>
              <Text style={[styles.infoValue, { color: text }]}>{spot.cityLabel}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: muted }]}>Адрес</Text>
              <Text style={[styles.infoValue, { color: text }]}>{spot.address}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: muted }]}>Статус</Text>
              <Text style={[styles.infoValue, { color: colors.green }]}>{statusCopy[status]}</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    height: 250,
    backgroundColor: '#142119',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  heroGlow: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#1F5E42',
    opacity: 0.56
  },
  heroLetter: {
    color: colors.green,
    fontSize: 92,
    fontWeight: '900',
    letterSpacing: -6
  },
  closeButton: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(11,15,12,0.72)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    color: colors.white,
    fontSize: 27,
    lineHeight: 30
  },
  content: {
    padding: 22,
    paddingBottom: 50
  },
  category: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.7
  },
  title: {
    marginTop: 5,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1.2
  },
  meta: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22
  },
  primaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15
  },
  primaryText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
  },
  secondaryButton: {
    minWidth: 105,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '800'
  },
  block: {
    marginTop: 12,
    borderRadius: 22,
    padding: 17
  },
  blockLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  note: {
    marginTop: 9,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600'
  },
  infoRow: {
    marginTop: 13,
    flexDirection: 'row',
    gap: 14
  },
  infoKey: {
    width: 68,
    fontSize: 13
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700'
  }
});
