import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
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
import type { Collection, Spot } from '../types';

type Props = {
  collection: Collection | null;
  spots: Spot[];
  visible: boolean;
  onClose: () => void;
};

function navigationURL(spot: Spot, driving: boolean) {
  const params = new URLSearchParams({
    api: '1',
    destination: String(spot.latitude) + ',' + String(spot.longitude),
    travelmode: driving ? 'driving' : 'walking'
  });
  return 'https://www.google.com/maps/dir/?' + params.toString();
}

export function RouteRunModal({
  collection,
  spots,
  visible,
  onClose
}: Props) {
  const dark = useColorScheme() === 'dark';
  const { updateStatus } = useSpotStore();
  const [skippedIds, setSkippedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setSkippedIds([]);
  }, [visible]);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;
  const raised = dark ? colors.darkSurfaceRaised : colors.lightMuted;

  const progress = useMemo(() => {
    const completed = spots.filter((spot) => spot.status === 'visited').length;
    const skipped = skippedIds.filter((id) => spots.some((spot) => spot.id === id)).length;
    const current = spots.find(
      (spot) => spot.status !== 'visited' && !skippedIds.includes(spot.id)
    ) ?? null;

    const currentIndex = current
      ? spots.findIndex((spot) => spot.id === current.id)
      : -1;

    const next = currentIndex >= 0
      ? spots.slice(currentIndex + 1).find(
          (spot) => spot.status !== 'visited' && !skippedIds.includes(spot.id)
        ) ?? null
      : null;

    return {
      completed,
      skipped,
      current,
      currentIndex,
      next,
      done: !current
    };
  }, [skippedIds, spots]);

  if (!collection?.routePlan) return null;

  const routePlan = collection.routePlan;
  const driving = routePlan.transport === 'driving';

  async function openCurrentInMaps() {
    if (!progress.current) return;
    try {
      await Linking.openURL(navigationURL(progress.current, driving));
    } catch {
      Alert.alert('Не удалось открыть карты', 'Попробуйте ещё раз.');
    }
  }

  function completeCurrent() {
    if (!progress.current) return;
    updateStatus(progress.current.id, 'visited');
  }

  function skipCurrent() {
    if (!progress.current) return;
    setSkippedIds((current) => [...current, progress.current!.id]);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>МАРШРУТ В ПРОЦЕССЕ</Text>
            <Text style={[styles.title, { color: text }]}>{collection.title}</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              {driving ? 'На машине' : 'Пешком'} · {spots.length} точек
            </Text>
          </View>
          <Pressable onPress={onClose} style={[styles.close, { backgroundColor: surface }]}>
            <Text style={[styles.closeText, { color: text }]}>×</Text>
          </Pressable>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressTop}>
            <Text style={[styles.progressLabel, { color: muted }]}>
              ПРОГРЕСС
            </Text>
            <Text style={[styles.progressValue, { color: text }]}>
              {Math.min(spots.length, progress.completed + progress.skipped)} / {spots.length}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: raised }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: spots.length === 0
                    ? '0%'
                    : String(
                        Math.min(
                          100,
                          ((progress.completed + progress.skipped) / spots.length) * 100
                        )
                      ) + '%'
                }
              ]}
            />
          </View>
          <Text style={[styles.progressHint, { color: muted }]}>
            Посещено: {progress.completed}
            {progress.skipped > 0 ? ' · Пропущено: ' + String(progress.skipped) : ''}
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {progress.done ? (
            <View style={[styles.doneCard, { backgroundColor: surface }]}>
              <Text style={styles.doneIcon}>✓</Text>
              <Text style={[styles.doneTitle, { color: text }]}>Маршрут завершён</Text>
              <Text style={[styles.doneText, { color: muted }]}>
                Все точки пройдены или пропущены. Посещённые места уже отмечены в СПОТ.
              </Text>
              <Pressable onPress={onClose} style={styles.doneButton}>
                <Text style={styles.doneButtonText}>Готово</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: muted }]}>СЕЙЧАС</Text>

              <View style={[styles.currentCard, { backgroundColor: surface }]}>
                <View style={styles.currentTop}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>
                      {progress.currentIndex + 1}
                    </Text>
                  </View>
                  <View style={styles.currentCopy}>
                    <Text style={styles.currentMeta}>
                      {progress.current?.categoryLabel.toUpperCase()}
                    </Text>
                    <Text style={[styles.currentName, { color: text }]}>
                      {progress.current?.name}
                    </Text>
                    <Text style={[styles.currentAddress, { color: muted }]}>
                      {progress.current?.address}
                    </Text>
                  </View>
                  <Text style={[styles.rating, { color: text }]}>
                    ★ {progress.current?.rating.toFixed(1)}
                  </Text>
                </View>

                <Pressable onPress={() => void openCurrentInMaps()} style={styles.mapButton}>
                  <Text style={styles.mapButtonText}>↗ До этой точки в картах</Text>
                </Pressable>

                <View style={styles.currentActions}>
                  <Pressable
                    onPress={skipCurrent}
                    style={[styles.skipButton, { backgroundColor: raised }]}
                  >
                    <Text style={[styles.skipButtonText, { color: text }]}>Пропустить</Text>
                  </Pressable>
                  <Pressable onPress={completeCurrent} style={styles.completeButton}>
                    <Text style={styles.completeButtonText}>✓ Я здесь / посетил</Text>
                  </Pressable>
                </View>
              </View>

              {progress.next ? (
                <>
                  <Text style={[styles.sectionLabel, { color: muted }]}>ДАЛЬШЕ</Text>
                  <View style={[styles.nextCard, { backgroundColor: surface }]}>
                    <View style={styles.nextNumber}>
                      <Text style={styles.nextNumberText}>
                        {spots.findIndex((spot) => spot.id === progress.next?.id) + 1}
                      </Text>
                    </View>
                    <View style={styles.nextCopy}>
                      <Text style={[styles.nextName, { color: text }]}>
                        {progress.next.name}
                      </Text>
                      <Text style={[styles.nextAddress, { color: muted }]} numberOfLines={1}>
                        {progress.next.address}
                      </Text>
                    </View>
                    <Text style={[styles.nextRating, { color: muted }]}>
                      ★ {progress.next.rating.toFixed(1)}
                    </Text>
                  </View>
                </>
              ) : null}

              <Text style={[styles.sectionLabel, { color: muted }]}>ВЕСЬ ПЛАН</Text>
              <View style={[styles.planCard, { backgroundColor: surface }]}>
                {spots.map((spot, index) => {
                  const visited = spot.status === 'visited';
                  const skipped = skippedIds.includes(spot.id);
                  const active = progress.current?.id === spot.id;

                  return (
                    <View
                      key={spot.id}
                      style={[
                        styles.planRow,
                        index > 0 && { borderTopColor: dark ? '#243029' : '#E9ECEA', borderTopWidth: 1 }
                      ]}
                    >
                      <View
                        style={[
                          styles.planIndex,
                          active && styles.planIndexActive,
                          visited && styles.planIndexVisited
                        ]}
                      >
                        <Text
                          style={[
                            styles.planIndexText,
                            (active || visited) && styles.planIndexTextActive
                          ]}
                        >
                          {visited ? '✓' : index + 1}
                        </Text>
                      </View>
                      <View style={styles.planCopy}>
                        <Text
                          style={[
                            styles.planName,
                            { color: visited || skipped ? muted : text }
                          ]}
                        >
                          {spot.name}
                        </Text>
                        <Text style={[styles.planState, { color: muted }]}>
                          {visited
                            ? 'Посещено'
                            : skipped
                              ? 'Пропущено'
                              : active
                                ? 'Текущая точка'
                                : 'Впереди'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 24
  },
  header: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  headerCopy: {
    flex: 1
  },
  eyebrow: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.25
  },
  title: {
    marginTop: 5,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.8
  },
  subtitle: {
    marginTop: 5,
    fontSize: 11
  },
  close: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    fontSize: 24
  },
  progressWrap: {
    paddingHorizontal: 20,
    marginTop: 20
  },
  progressTop: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  progressLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1
  },
  progressValue: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: '900'
  },
  progressTrack: {
    height: 7,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 8
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: colors.green
  },
  progressHint: {
    marginTop: 6,
    fontSize: 9
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 34
  },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 7,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.15
  },
  currentCard: {
    borderRadius: 24,
    padding: 16
  },
  currentTop: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'flex-start'
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: '#173528',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepBadgeText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '900'
  },
  currentCopy: {
    flex: 1
  },
  currentMeta: {
    color: colors.green,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  currentName: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '900'
  },
  currentAddress: {
    marginTop: 5,
    fontSize: 10,
    lineHeight: 15
  },
  rating: {
    fontSize: 10,
    fontWeight: '900'
  },
  mapButton: {
    minHeight: 50,
    borderRadius: 17,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15
  },
  mapButtonText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: '900'
  },
  currentActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  skipButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  skipButtonText: {
    fontSize: 10,
    fontWeight: '900'
  },
  completeButton: {
    flex: 1.45,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#173528',
    alignItems: 'center',
    justifyContent: 'center'
  },
  completeButtonText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '900'
  },
  nextCard: {
    borderRadius: 18,
    minHeight: 68,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  nextNumber: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#173528',
    alignItems: 'center',
    justifyContent: 'center'
  },
  nextNumberText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '900'
  },
  nextCopy: {
    flex: 1
  },
  nextName: {
    fontSize: 13,
    fontWeight: '900'
  },
  nextAddress: {
    marginTop: 4,
    fontSize: 9
  },
  nextRating: {
    fontSize: 9,
    fontWeight: '800'
  },
  planCard: {
    borderRadius: 20,
    paddingHorizontal: 13
  },
  planRow: {
    minHeight: 61,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  planIndex: {
    width: 29,
    height: 29,
    borderRadius: 11,
    backgroundColor: '#26312B',
    alignItems: 'center',
    justifyContent: 'center'
  },
  planIndexActive: {
    backgroundColor: '#173528'
  },
  planIndexVisited: {
    backgroundColor: colors.green
  },
  planIndexText: {
    color: '#8D9791',
    fontSize: 9,
    fontWeight: '900'
  },
  planIndexTextActive: {
    color: colors.black
  },
  planCopy: {
    flex: 1
  },
  planName: {
    fontSize: 11,
    fontWeight: '900'
  },
  planState: {
    marginTop: 3,
    fontSize: 8
  },
  doneCard: {
    borderRadius: 26,
    padding: 26,
    alignItems: 'center',
    marginTop: 12
  },
  doneIcon: {
    color: colors.green,
    fontSize: 40,
    fontWeight: '900'
  },
  doneTitle: {
    marginTop: 10,
    fontSize: 21,
    fontWeight: '900'
  },
  doneText: {
    marginTop: 7,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    maxWidth: 290
  },
  doneButton: {
    marginTop: 18,
    minHeight: 48,
    minWidth: 150,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  doneButtonText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: '900'
  }
});
