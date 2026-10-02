import React, { useMemo } from 'react';
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
import type { DiscoveryInterest, Spot } from '../types';
import { getSpotOpenState } from '../utils/openingHours';
import { SpotCard } from './SpotCard';

type Props = {
  visible: boolean;
  spots: Spot[];
  interests: DiscoveryInterest[];
  onClose: () => void;
  onSelect: (spot: Spot) => void;
  onSave: (spot: Spot) => void;
  onDismiss: (spot: Spot) => void;
};

function reasonLabels(spot: Spot, interests: DiscoveryInterest[]) {
  const reasons: string[] = [];

  if (interests.includes(spot.category as DiscoveryInterest)) {
    reasons.push('в твоих интересах');
  }
  if (spot.rating >= 4.7) {
    reasons.push('высокий рейтинг');
  }
  if ((spot.reviewCount ?? 0) >= 500) {
    reasons.push('много отзывов');
  }
  if (spot.distanceMeters > 0 && spot.distanceMeters <= 1500) {
    reasons.push('рядом');
  }
  if (getSpotOpenState(spot).kind === 'open') {
    reasons.push('открыто сейчас');
  }

  if (reasons.length === 0) {
    reasons.push('похоже на твои сохранения');
  }

  return reasons.slice(0, 3);
}

export function PersonalizedDiscoverySheet({
  visible,
  spots,
  interests,
  onClose,
  onSelect,
  onSave,
  onDismiss
}: Props) {
  const dark = useColorScheme() === 'dark';
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;
  const raised = dark ? colors.darkSurfaceRaised : colors.lightMuted;

  const ranked = useMemo(
    () => spots.map((spot) => ({
      spot,
      reasons: reasonLabels(spot, interests)
    })),
    [interests, spots]
  );

  return (
    <Modal
      visible={visible}
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
            <Text style={styles.eyebrow}>✦ ДЛЯ ТЕБЯ</Text>
            <Text style={[styles.title, { color: text }]}>Новые места рядом</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              По интересам и тому, что уже есть в твоём СПОТ.
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {ranked.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: surface }]}>
              <Text style={styles.emptyIcon}>✦</Text>
              <Text style={[styles.emptyTitle, { color: text }]}>Пока всё разобрали</Text>
              <Text style={[styles.emptyText, { color: muted }]}>
                Передвинь карту в другую область или попробуй позже — скрытые и уже сохранённые места повторно не показываем.
              </Text>
            </View>
          ) : (
            ranked.map(({ spot, reasons }) => (
              <View key={spot.id} style={styles.item}>
                <View style={styles.reasonRow}>
                  {reasons.map((reason) => (
                    <View key={reason} style={[styles.reasonChip, { backgroundColor: raised }]}>
                      <Text style={[styles.reasonText, { color: muted }]}>{reason}</Text>
                    </View>
                  ))}
                </View>

                <SpotCard
                  spot={spot}
                  compact
                  onPress={() => onSelect(spot)}
                />

                <View style={styles.actions}>
                  <Pressable
                    onPress={() => onDismiss(spot)}
                    style={[styles.dismissButton, { backgroundColor: raised }]}
                  >
                    <Text style={[styles.dismissText, { color: text }]}>Не моё</Text>
                  </Pressable>
                  <Pressable onPress={() => onSave(spot)} style={styles.saveButton}>
                    <Text style={styles.saveText}>♥ В СПОТ</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          <Text style={[styles.footerHint, { color: muted }]}>
            «Не моё» скрывает рекомендацию на этом устройстве. Личные заметки и сохранения не используются публично.
          </Text>
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
    minHeight: 92,
    paddingHorizontal: 16,
    paddingTop: 8,
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
  eyebrow: {
    color: colors.green,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.15
  },
  title: {
    marginTop: 3,
    fontSize: 18,
    fontWeight: '900'
  },
  subtitle: {
    marginTop: 3,
    fontSize: 10,
    textAlign: 'center'
  },
  headerSpacer: {
    width: 44
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 44
  },
  item: {
    marginBottom: 18
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 7,
    paddingHorizontal: 3
  },
  reasonChip: {
    minHeight: 25,
    paddingHorizontal: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  reasonText: {
    fontSize: 8,
    fontWeight: '800'
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 7
  },
  dismissButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dismissText: {
    fontSize: 10,
    fontWeight: '900'
  },
  saveButton: {
    flex: 1.35,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveText: {
    color: colors.black,
    fontSize: 10,
    fontWeight: '900'
  },
  empty: {
    marginTop: 18,
    borderRadius: 24,
    padding: 26,
    alignItems: 'center'
  },
  emptyIcon: {
    color: colors.green,
    fontSize: 34,
    fontWeight: '900'
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '900'
  },
  emptyText: {
    marginTop: 6,
    maxWidth: 290,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17
  },
  footerHint: {
    marginTop: 3,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 14
  }
});
