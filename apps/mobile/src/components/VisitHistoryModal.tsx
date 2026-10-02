import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native';

import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { Spot } from '../types';
import { PlaceDetailModal } from './PlaceDetailModal';
import { SpotCard } from './SpotCard';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function formatVisitedAt(value?: string) {
  if (!value) return 'Дата не сохранена';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата не сохранена';

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function VisitHistoryModal({ visible, onClose }: Props) {
  const dark = useColorScheme() === 'dark';
  const { savedSpots } = useSpotStore();
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const visited = useMemo(
    () => savedSpots
      .filter((spot) => spot.status === 'visited')
      .sort((a, b) => {
        const aTime = a.visitedAt ? new Date(a.visitedAt).getTime() : 0;
        const bTime = b.visitedAt ? new Date(b.visitedAt).getTime() : 0;
        return bTime - aTime;
      }),
    [savedSpots]
  );

  return (
    <>
      <Modal
        visible={visible && !selectedSpot}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeText, { color: text }]}>×</Text>
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: text }]}>История посещений</Text>
              <Text style={[styles.subtitle, { color: muted }]}>{visited.length} отмечено как «Был здесь»</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {visited.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>✓</Text></View>
                <Text style={[styles.emptyTitle, { color: text }]}>История пока пустая</Text>
                <Text style={[styles.emptyText, { color: muted }]}>
                  После посещения открой спот и нажми «Был здесь» — место появится в этой истории.
                </Text>
              </View>
            ) : (
              visited.map((spot) => (
                <View key={spot.id} style={styles.item}>
                  <Text style={[styles.date, { color: muted }]}>{formatVisitedAt(spot.visitedAt)}</Text>
                  <SpotCard spot={spot} compact onPress={() => setSelectedSpot(spot)} />
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      <PlaceDetailModal
        spot={selectedSpot}
        visible={Boolean(selectedSpot)}
        onClose={() => setSelectedSpot(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  header: {
    minHeight: 78,
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
  content: {
    paddingHorizontal: 18,
    paddingBottom: 48
  },
  item: {
    marginBottom: 16
  },
  date: {
    marginBottom: 7,
    marginLeft: 4,
    fontSize: 11,
    fontWeight: '800'
  },
  empty: {
    paddingTop: 90,
    paddingHorizontal: 28,
    alignItems: 'center'
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyIconText: {
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
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19
  }
});
