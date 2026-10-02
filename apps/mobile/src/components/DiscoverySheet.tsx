import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native';

import { colors } from '../theme';
import type { Spot } from '../types';
import { getSpotOpenState } from '../utils/openingHours';
import { SpotCard } from './SpotCard';

type SortMode = 'best' | 'nearest';

type Props = {
  visible: boolean;
  spots: Spot[];
  categoryLabel: string;
  onClose: () => void;
  onSelect: (spot: Spot) => void;
};

export function DiscoverySheet({
  visible,
  spots,
  categoryLabel,
  onClose,
  onSelect
}: Props) {
  const dark = useColorScheme() === 'dark';
  const [openOnly, setOpenOnly] = useState(false);
  const [highRatedOnly, setHighRatedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('best');

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  useEffect(() => {
    if (visible) return;
    setOpenOnly(false);
    setHighRatedOnly(false);
    setSortMode('best');
  }, [visible]);

  const filtered = useMemo(() => {
    const result = spots.filter((spot) => {
      if (openOnly && getSpotOpenState(spot).kind !== 'open') return false;
      if (highRatedOnly && spot.rating < 4.5) return false;
      return true;
    });

    return [...result].sort((a, b) => {
      if (sortMode === 'nearest') {
        const distanceDelta = a.distanceMeters - b.distanceMeters;
        if (distanceDelta !== 0) return distanceDelta;
      }

      const ratingDelta = b.rating - a.rating;
      if (ratingDelta !== 0) return ratingDelta;

      const reviewDelta = (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      if (reviewDelta !== 0) return reviewDelta;

      return a.distanceMeters - b.distanceMeters;
    });
  }, [highRatedOnly, openOnly, sortMode, spots]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: text }]}>×</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: text }]}>{categoryLabel} рядом</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              {spots.length} мест в этой области
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          style={styles.filterScroller}
        >
          <Pressable
            onPress={() => setOpenOnly((current) => !current)}
            style={[styles.filter, { backgroundColor: openOnly ? colors.green : surface }]}
          >
            <Text style={[styles.filterText, { color: openOnly ? colors.black : text }]}>
              ● Открыто сейчас
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setHighRatedOnly((current) => !current)}
            style={[styles.filter, { backgroundColor: highRatedOnly ? colors.green : surface }]}
          >
            <Text style={[styles.filterText, { color: highRatedOnly ? colors.black : text }]}>
              ★ 4.5+
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSortMode('best')}
            style={[styles.filter, { backgroundColor: sortMode === 'best' ? colors.green : surface }]}
          >
            <Text style={[styles.filterText, { color: sortMode === 'best' ? colors.black : text }]}>
              Лучшие
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSortMode('nearest')}
            style={[styles.filter, { backgroundColor: sortMode === 'nearest' ? colors.green : surface }]}
          >
            <Text style={[styles.filterText, { color: sortMode === 'nearest' ? colors.black : text }]}>
              Ближе
            </Text>
          </Pressable>
        </ScrollView>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>⌖</Text></View>
              <Text style={[styles.emptyTitle, { color: text }]}>По фильтрам ничего нет</Text>
              <Text style={[styles.emptyText, { color: muted }]}>
                Отключи один из фильтров или вернись на карту и поищи в другой области.
              </Text>
            </View>
          ) : (
            filtered.map((spot, index) => (
              <View key={spot.id} style={styles.cardWrap}>
                {index < 3 && sortMode === 'best' && spot.rating > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>#{index + 1} ПО РЕЙТИНГУ</Text>
                  </View>
                ) : null}
                <SpotCard
                  spot={spot}
                  compact
                  onPress={() => {
                    onSelect(spot);
                    onClose();
                  }}
                />
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  header: {
    minHeight: 76,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    fontSize: 30,
    lineHeight: 34
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center'
  },
  title: {
    fontSize: 18,
    fontWeight: '900'
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700'
  },
  headerSpacer: {
    width: 44
  },
  filterScroller: {
    flexGrow: 0
  },
  filters: {
    paddingHorizontal: 18,
    paddingBottom: 6,
    gap: 8
  },
  filter: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterText: {
    fontSize: 11,
    fontWeight: '900'
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 46
  },
  cardWrap: {
    marginTop: 12
  },
  badge: {
    alignSelf: 'flex-start',
    height: 24,
    marginBottom: 6,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeText: {
    color: colors.black,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  empty: {
    paddingTop: 90,
    paddingHorizontal: 28,
    alignItems: 'center'
  },
  emptyMark: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyMarkText: {
    color: colors.black,
    fontSize: 26,
    fontWeight: '900'
  },
  emptyTitle: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: '900'
  },
  emptyText: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center'
  }
});
