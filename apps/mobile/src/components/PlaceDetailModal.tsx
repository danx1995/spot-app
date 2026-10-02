import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { useSpotStore } from '../state/SpotStore';
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
  const {
    collections,
    getSavedSpot,
    saveSpot,
    removeSpot,
    updateStatus,
    toggleFavorite,
    togglePlaceInCollection
  } = useSpotStore();
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  if (!spot) return null;

  const saved = getSavedSpot(spot.id);
  const current = saved ?? spot;
  const status = saved?.status ?? 'want';
  const isHotel = current.category === 'hotel';

  function ensureSaved(nextStatus: SpotStatus) {
    if (saved) {
      updateStatus(current.id, nextStatus);
    } else {
      saveSpot(current, nextStatus);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroLetter}>{isHotel ? 'H' : 'S'}</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.category, { color: colors.green }]}>{current.categoryLabel.toUpperCase()}</Text>
          <Text style={[styles.title, { color: text }]}>{current.name}</Text>
          <Text style={[styles.meta, { color: muted }]}>
            {current.rating > 0 ? `★ ${current.rating.toFixed(1)} · ` : ''}{current.address}
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                if (!saved) saveSpot(current, 'want');
              }}
              style={[styles.primaryButton, saved && styles.primaryButtonSaved]}
            >
              <Text style={styles.primaryText}>{saved ? '✓ В СПОТ' : isHotel ? '♥ Хочу остановиться' : '♥ Хочу сюда'}</Text>
            </Pressable>

            <Pressable
              onPress={() => ensureSaved('visited')}
              style={[styles.secondaryButton, { backgroundColor: surface }]}
            >
              <Text style={[styles.secondaryText, { color: status === 'visited' ? colors.green : text }]}>
                {status === 'visited' ? '✓ Был' : 'Был здесь'}
              </Text>
            </Pressable>
          </View>

          {isHotel ? (
            <Pressable
              onPress={() => ensureSaved('booked')}
              style={[styles.fullSecondary, { backgroundColor: surface }]}
            >
              <Text style={[styles.secondaryText, { color: status === 'booked' ? colors.booked : text }]}>
                {status === 'booked' ? '✓ Отель забронирован' : 'Отметить как забронированный'}
              </Text>
            </Pressable>
          ) : null}

          <View style={[styles.block, { backgroundColor: surface }]}>
            <Text style={[styles.blockLabel, { color: muted }]}>ПОЧЕМУ СОХРАНЕНО</Text>
            <Text style={[styles.note, { color: text }]}>
              {current.note ?? 'Добавь заметку, чтобы потом вспомнить, почему захотелось сюда попасть.'}
            </Text>
          </View>

          {saved && collections.length > 0 ? (
            <View style={[styles.block, { backgroundColor: surface }]}>
              <Text style={[styles.blockLabel, { color: muted }]}>ПОДБОРКИ</Text>
              <View style={styles.collectionList}>
                {collections.map((collection) => {
                  const active = collection.placeIds.includes(current.id);
                  return (
                    <Pressable
                      key={collection.id}
                      onPress={() => togglePlaceInCollection(collection.id, current.id)}
                      style={[styles.collectionChip, active && styles.collectionChipActive]}
                    >
                      <Text style={[styles.collectionChipText, { color: active ? colors.black : text }]}>
                        {active ? '✓ ' : '+ '}{collection.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={[styles.block, { backgroundColor: surface }]}>
            <Text style={[styles.blockLabel, { color: muted }]}>О МЕСТЕ</Text>
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: muted }]}>Город</Text>
              <Text style={[styles.infoValue, { color: text }]}>{current.cityLabel}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: muted }]}>Адрес</Text>
              <Text style={[styles.infoValue, { color: text }]}>{current.address}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: muted }]}>Статус</Text>
              <Text style={[styles.infoValue, { color: saved ? colors.green : muted }]}>
                {saved ? statusCopy[status] : 'Не сохранено'}
              </Text>
            </View>
          </View>

          {saved ? (
            <View style={styles.manageRow}>
              <Pressable onPress={() => toggleFavorite(current.id)}>
                <Text style={[styles.manageText, { color: current.favorite ? colors.green : muted }]}>
                  {current.favorite ? '♥ Любимое' : '♡ В любимое'}
                </Text>
              </Pressable>
              <Pressable onPress={() => {
                removeSpot(current.id);
                onClose();
              }}>
                <Text style={[styles.removeText, { color: colors.error }]}>Удалить из СПОТ</Text>
              </Pressable>
            </View>
          ) : null}
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
  primaryButtonSaved: {
    backgroundColor: '#5ADAA2'
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
  fullSecondary: {
    minHeight: 52,
    marginTop: 10,
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
  collectionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12
  },
  collectionChip: {
    minHeight: 38,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.darkSurfaceRaised
  },
  collectionChipActive: {
    backgroundColor: colors.green
  },
  collectionChipText: {
    fontSize: 12,
    fontWeight: '800'
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
  },
  manageRow: {
    marginTop: 22,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  manageText: {
    fontSize: 13,
    fontWeight: '800'
  },
  removeText: {
    fontSize: 13,
    fontWeight: '800'
  }
});
