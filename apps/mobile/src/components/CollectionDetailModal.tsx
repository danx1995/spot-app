import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';

import { publishCollection } from '../services/libraryApi';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { Collection, CollectionRoutePlan, Spot } from '../types';
import { PlaceDetailModal } from './PlaceDetailModal';
import { SpotCard } from './SpotCard';

type Props = {
  collection: Collection | null;
  visible: boolean;
  onClose: () => void;
};

function routePlanSummary(plan: CollectionRoutePlan) {
  const start = plan.startPreset === 'now'
    ? 'Сейчас'
    : plan.startPreset === 'evening'
      ? 'Вечером · 19:00'
      : 'Завтра · 12:00';
  const transport = plan.transport === 'driving' ? 'На машине' : 'Пешком';
  const origin = plan.startMode === 'current_location' ? 'от меня' : 'с первой точки';

  return start + ' · ' + transport + ' · ' + String(plan.stopMinutes) + ' мин/место · ' + origin;
}

function buildSavedRouteURL(spots: Spot[], plan: CollectionRoutePlan) {
  if (spots.length < 2) return null;

  const coordinate = (spot: Spot) => String(spot.latitude) + ',' + String(spot.longitude);
  const destination = spots[spots.length - 1] as Spot;
  const params = new URLSearchParams({
    api: '1',
    destination: coordinate(destination),
    travelmode: plan.transport === 'driving' ? 'driving' : 'walking'
  });

  const waypoints = plan.startMode === 'current_location'
    ? spots.slice(0, -1)
    : spots.slice(1, -1);

  if (plan.startMode === 'first_stop') {
    params.set('origin', coordinate(spots[0] as Spot));
  }
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.map(coordinate).join('|'));
  }

  return 'https://www.google.com/maps/dir/?' + params.toString();
}

function buildShareText(collection: Collection, spots: Spot[]) {
  const places = spots
    .map((spot, index) => `${index + 1}. ${spot.name} — ${spot.address}`)
    .join('\n');

  return [
    `СПОТ · ${collection.title}`,
    collection.subtitle,
    '',
    places || 'В подборке пока нет мест.',
    '',
    'Собрано в СПОТ'
  ].join('\n');
}

export function CollectionDetailModal({ collection, visible, onClose }: Props) {
  const dark = useColorScheme() === 'dark';
  const {
    savedSpots,
    togglePlaceInCollection,
    deleteCollection,
    updateCollection,
    updateCollectionRoutePlan,
    reorderCollectionPlace,
    syncNow
  } = useSpotStore();
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSubtitle, setDraftSubtitle] = useState('');
  const [draftCity, setDraftCity] = useState<Collection['city']>('both');
  const [routeEditing, setRouteEditing] = useState(false);
  const [draftRoutePlan, setDraftRoutePlan] = useState<CollectionRoutePlan | null>(null);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  const spots = useMemo(() => {
    if (!collection) return [];
    const byID = new Map(savedSpots.map((spot) => [spot.id, spot]));
    return collection.placeIds
      .map((id) => byID.get(id))
      .filter((spot): spot is Spot => Boolean(spot));
  }, [collection, savedSpots]);

  if (!collection) return null;
  const activeCollection: Collection = collection;
  const routePlan = activeCollection.routePlan;

  function openRouteEditor() {
    if (!routePlan) return;
    setDraftRoutePlan({ ...routePlan });
    setRouteEditing(true);
  }

  function patchDraftRoutePlan(patch: Partial<CollectionRoutePlan>) {
    setDraftRoutePlan((current) => current ? { ...current, ...patch } : current);
  }

  function saveRoutePlanChanges() {
    if (!draftRoutePlan) return;
    updateCollectionRoutePlan(activeCollection.id, draftRoutePlan);
    setRouteEditing(false);
  }

  function removePlace(placeID: string) {
    togglePlaceInCollection(activeCollection.id, placeID);
  }


  function openEditor() {
    setDraftTitle(activeCollection.title);
    setDraftSubtitle(activeCollection.subtitle);
    setDraftCity(activeCollection.city);
    setEditing(true);
  }

  function saveCollectionChanges() {
    const title = draftTitle.trim();
    if (!title) return;

    updateCollection(activeCollection.id, {
      title,
      subtitle: draftSubtitle,
      city: draftCity
    });
    setEditing(false);
  }

  function confirmDelete() {
    Alert.alert(
      'Удалить подборку?',
      `«${activeCollection.title}» исчезнет, но сами споты останутся сохранены.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteCollection(activeCollection.id);
            onClose();
          }
        }
      ]
    );
  }

  async function openSavedRoute() {
    if (!routePlan) return;
    const url = buildSavedRouteURL(spots, routePlan);
    if (!url) return;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Не удалось открыть карты', 'Попробуйте ещё раз.');
    }
  }

  async function shareCollection() {
    if (sharing) return;
    setSharing(true);

    try {
      await syncNow();
      const publicURL = await publishCollection(activeCollection.id);
      await Share.share({
        message: [
          buildShareText(activeCollection, spots),
          '',
          'Открыть подборку без установки СПОТ:',
          publicURL
        ].join('\n'),
        title: activeCollection.title
      });
    } catch {
      await Share.share({
        message: buildShareText(activeCollection, spots),
        title: activeCollection.title
      });
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Modal
        visible={visible && !selectedSpot}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
          <View style={styles.hero}>
            <View style={styles.heroGlow} />
            <Text style={styles.heroHeart}>{routePlan ? '⌁' : '♥'}</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.titleRow}>
              <View style={styles.titleCopy}>
                <Text style={[styles.city, { color: colors.green }]}>{activeCollection.cityLabel.toUpperCase()}</Text>
                <Text style={[styles.title, { color: text }]}>{activeCollection.title}</Text>
                <Text style={[styles.subtitle, { color: muted }]}>{activeCollection.subtitle}</Text>
                <Pressable onPress={openEditor} style={styles.editCollectionButton}>
                  <Text style={styles.editCollectionText}>Изменить</Text>
                </Pressable>
              </View>
              <View style={[styles.count, { backgroundColor: surface }]}>
                <Text style={[styles.countValue, { color: text }]}>{spots.length}</Text>
                <Text style={[styles.countLabel, { color: muted }]}>мест</Text>
              </View>
            </View>

            {routePlan ? (
              <View style={[styles.routeCard, { backgroundColor: surface }]}>
                <View style={styles.routeCardTop}>
                  <View style={styles.routeCardCopy}>
                    <Text style={styles.routeCardEyebrow}>СОХРАНЁННЫЙ МАРШРУТ</Text>
                    <Text style={[styles.routeCardTitle, { color: text }]}>
                      {routePlan.transport === 'driving' ? '→ На машине' : '⌁ Пешком'}
                    </Text>
                    <Text style={[styles.routeCardMeta, { color: muted }]}>
                      {routePlanSummary(routePlan)}
                    </Text>
                  </View>
                  <View style={styles.routeBadge}>
                    <Text style={styles.routeBadgeText}>{spots.length}</Text>
                    <Text style={styles.routeBadgeHint}>точек</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => void openSavedRoute()}
                  disabled={spots.length < 2}
                  style={[styles.routeOpenButton, spots.length < 2 && styles.routeOpenButtonDisabled]}
                >
                  <Text style={styles.routeOpenButtonText}>↗ Открыть весь маршрут в картах</Text>
                </Pressable>
                <Pressable
                  onPress={openRouteEditor}
                  style={[
                    styles.routeEditButton,
                    { backgroundColor: dark ? colors.darkSurfaceRaised : colors.lightMuted }
                  ]}
                >
                  <Text style={[styles.routeEditButtonText, { color: text }]}>
                    ⚙ Настроить маршрут
                  </Text>
                </Pressable>
                <Text style={[styles.routePrivacy, { color: muted }]}>
                  {routePlan.startMode === 'current_location'
                    ? 'Текущая геопозиция не хранится — карты возьмут её только при открытии маршрута.'
                    : 'Порядок точек можно менять стрелками ниже — маршрут откроется именно в этом порядке.'}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void shareCollection()}
              disabled={sharing}
              style={[styles.shareButton, sharing && styles.shareButtonBusy]}
            >
              <Text style={styles.shareButtonText}>
                {sharing ? 'Готовим ссылку…' : '↗ Поделиться подборкой'}
              </Text>
            </Pressable>
            <Text style={[styles.shareHint, { color: muted }]}>
              По ссылке подборка откроется в браузере даже без установленного СПОТ.
            </Text>

            <Text style={[styles.sectionLabel, { color: muted }]}>МЕСТА</Text>

            {spots.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: surface }]}>
                <Text style={[styles.emptyTitle, { color: text }]}>Подборка пока пустая</Text>
                <Text style={[styles.emptyText, { color: muted }]}>
                  Открой любой сохранённый спот и добавь его сюда в блоке «Подборки».
                </Text>
              </View>
            ) : (
              spots.map((spot, index) => (
                <View key={spot.id} style={styles.spotWrap}>
                  <SpotCard spot={spot} compact onPress={() => setSelectedSpot(spot)} />
                  <View style={styles.placeActions}>
                    <View style={styles.orderActions}>
                      <Pressable
                        disabled={index === 0}
                        onPress={() => reorderCollectionPlace(activeCollection.id, spot.id, 'up')}
                        style={[styles.orderButton, index === 0 && styles.orderButtonDisabled]}
                      >
                        <Text style={[styles.orderButtonText, { color: text }]}>↑</Text>
                      </Pressable>
                      <Pressable
                        disabled={index === spots.length - 1}
                        onPress={() => reorderCollectionPlace(activeCollection.id, spot.id, 'down')}
                        style={[styles.orderButton, index === spots.length - 1 && styles.orderButtonDisabled]}
                      >
                        <Text style={[styles.orderButtonText, { color: text }]}>↓</Text>
                      </Pressable>
                    </View>
                    <Pressable onPress={() => removePlace(spot.id)} style={styles.removeFromCollection}>
                      <Text style={[styles.removeFromCollectionText, { color: muted }]}>Убрать</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            <Pressable onPress={confirmDelete} style={styles.deleteButton}>
              <Text style={styles.deleteText}>Удалить подборку</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={editing}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.editorBackdrop}>
          <View style={[styles.editorCard, { backgroundColor: dark ? '#151B17' : colors.white }]}>
            <Text style={[styles.editorTitle, { color: text }]}>Изменить подборку</Text>
            <Text style={[styles.editorHint, { color: muted }]}>
              Название и описание можно менять в любой момент. Порядок мест настраивается стрелками в списке.
            </Text>

            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              maxLength={80}
              placeholder="Название подборки"
              placeholderTextColor={muted}
              style={[styles.editorInput, { color: text, backgroundColor: dark ? colors.darkSurfaceRaised : colors.lightMuted }]}
            />

            <TextInput
              value={draftSubtitle}
              onChangeText={setDraftSubtitle}
              maxLength={180}
              multiline
              placeholder="Короткое описание"
              placeholderTextColor={muted}
              style={[
                styles.editorInput,
                styles.editorTextarea,
                { color: text, backgroundColor: dark ? colors.darkSurfaceRaised : colors.lightMuted }
              ]}
            />

            <Text style={[styles.editorLabel, { color: muted }]}>ГОРОД</Text>
            <View style={styles.editorCities}>
              {([
                ['spb', 'СПБ'],
                ['moscow', 'Москва'],
                ['both', 'Оба']
              ] as Array<[Collection['city'], string]>).map(([value, label]) => {
                const active = draftCity === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setDraftCity(value)}
                    style={[styles.editorCity, active && styles.editorCityActive]}
                  >
                    <Text style={[styles.editorCityText, active && styles.editorCityTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.editorActions}>
              <Pressable onPress={() => setEditing(false)} style={styles.editorCancel}>
                <Text style={[styles.editorCancelText, { color: muted }]}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={saveCollectionChanges}
                disabled={!draftTitle.trim()}
                style={[styles.editorSave, !draftTitle.trim() && styles.editorSaveDisabled]}
              >
                <Text style={styles.editorSaveText}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={routeEditing && Boolean(draftRoutePlan)}
        transparent
        animationType="fade"
        onRequestClose={() => setRouteEditing(false)}
      >
        <View style={styles.editorBackdrop}>
          <View style={[styles.routeEditorCard, { backgroundColor: dark ? '#151B17' : colors.white }]}>
            <Text style={[styles.editorTitle, { color: text }]}>Настроить маршрут</Text>
            <Text style={[styles.editorHint, { color: muted }]}>
              Настройки сохраняются вместе с маршрутом. Порядок точек меняется стрелками в списке.
            </Text>

            {draftRoutePlan ? (
              <>
                <Text style={[styles.editorLabel, { color: muted }]}>ТРАНСПОРТ</Text>
                <View style={styles.routeOptions}>
                  {([
                    ['walking', '⌁ Пешком'],
                    ['driving', '→ На машине']
                  ] as Array<[CollectionRoutePlan['transport'], string]>).map(([value, label]) => {
                    const active = draftRoutePlan.transport === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => patchDraftRoutePlan({ transport: value })}
                        style={[styles.routeOption, active && styles.routeOptionActive]}
                      >
                        <Text style={[styles.routeOptionText, active && styles.routeOptionTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.editorLabel, { color: muted }]}>КОГДА</Text>
                <View style={styles.routeOptions}>
                  {([
                    ['now', 'Сейчас'],
                    ['evening', 'Вечером · 19:00'],
                    ['tomorrow', 'Завтра · 12:00']
                  ] as Array<[CollectionRoutePlan['startPreset'], string]>).map(([value, label]) => {
                    const active = draftRoutePlan.startPreset === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => patchDraftRoutePlan({ startPreset: value })}
                        style={[styles.routeOption, active && styles.routeOptionActive]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[styles.routeOptionText, active && styles.routeOptionTextActive]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.editorLabel, { color: muted }]}>НА КАЖДОЙ ТОЧКЕ</Text>
                <View style={styles.routeOptions}>
                  {([30, 45, 60] as Array<CollectionRoutePlan['stopMinutes']>).map((minutes) => {
                    const active = draftRoutePlan.stopMinutes === minutes;
                    return (
                      <Pressable
                        key={minutes}
                        onPress={() => patchDraftRoutePlan({ stopMinutes: minutes })}
                        style={[styles.routeOption, active && styles.routeOptionActive]}
                      >
                        <Text style={[styles.routeOptionText, active && styles.routeOptionTextActive]}>
                          {minutes} мин
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.editorLabel, { color: muted }]}>СТАРТ</Text>
                <View style={styles.routeOptions}>
                  {([
                    ['first_stop', 'С первой точки'],
                    ['current_location', '⌖ От меня']
                  ] as Array<[CollectionRoutePlan['startMode'], string]>).map(([value, label]) => {
                    const active = draftRoutePlan.startMode === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => patchDraftRoutePlan({ startMode: value })}
                        style={[styles.routeOption, active && styles.routeOptionActive]}
                      >
                        <Text style={[styles.routeOptionText, active && styles.routeOptionTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.routeEditorPrivacy, { color: muted }]}>
                  Для «От меня» точная геопозиция не сохраняется. Карты возьмут текущее местоположение только при открытии маршрута.
                </Text>
              </>
            ) : null}

            <View style={styles.editorActions}>
              <Pressable onPress={() => setRouteEditing(false)} style={styles.editorCancel}>
                <Text style={[styles.editorCancelText, { color: muted }]}>Отмена</Text>
              </Pressable>
              <Pressable onPress={saveRoutePlanChanges} style={styles.editorSave}>
                <Text style={styles.editorSaveText}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
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
  hero: {
    height: 190,
    backgroundColor: '#142119',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  heroGlow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#1F5E42',
    opacity: 0.48
  },
  heroHeart: {
    color: colors.green,
    fontSize: 76,
    fontWeight: '900'
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
    padding: 20,
    paddingBottom: 50
  },
  titleRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start'
  },
  titleCopy: {
    flex: 1
  },
  city: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  title: {
    marginTop: 5,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20
  },
  editCollectionButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: '#173528',
    alignItems: 'center',
    justifyContent: 'center'
  },
  editCollectionText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '900'
  },
  count: {
    minWidth: 66,
    minHeight: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  countValue: {
    fontSize: 21,
    fontWeight: '900'
  },
  countLabel: {
    marginTop: 2,
    fontSize: 10
  },
  routeCard: {
    marginTop: 20,
    borderRadius: 22,
    padding: 16
  },
  routeCardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center'
  },
  routeCardCopy: {
    flex: 1
  },
  routeCardEyebrow: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1
  },
  routeCardTitle: {
    marginTop: 5,
    fontSize: 18,
    fontWeight: '900'
  },
  routeCardMeta: {
    marginTop: 5,
    fontSize: 10,
    lineHeight: 15
  },
  routeBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#173528',
    alignItems: 'center',
    justifyContent: 'center'
  },
  routeBadgeText: {
    color: colors.green,
    fontSize: 18,
    fontWeight: '900'
  },
  routeBadgeHint: {
    marginTop: 1,
    color: '#8FB5A2',
    fontSize: 8,
    fontWeight: '800'
  },
  routeOpenButton: {
    minHeight: 49,
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  routeOpenButtonDisabled: {
    opacity: 0.35
  },
  routeOpenButtonText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: '900'
  },
  routeEditButton: {
    minHeight: 45,
    marginTop: 8,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  routeEditButtonText: {
    fontSize: 11,
    fontWeight: '900'
  },
  routePrivacy: {
    marginTop: 8,
    fontSize: 9,
    lineHeight: 14
  },
  shareButton: {
    minHeight: 54,
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shareButtonBusy: {
    opacity: 0.55
  },
  shareButtonText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
  },
  shareHint: {
    marginTop: 8,
    paddingHorizontal: 4,
    fontSize: 11,
    lineHeight: 16
  },
  sectionLabel: {
    marginTop: 26,
    marginBottom: 10,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  spotWrap: {
    marginBottom: 12
  },
  placeActions: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  orderActions: {
    flexDirection: 'row',
    gap: 7
  },
  orderButton: {
    width: 34,
    height: 30,
    borderRadius: 12,
    backgroundColor: colors.darkSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  orderButtonDisabled: {
    opacity: 0.24
  },
  orderButtonText: {
    fontSize: 15,
    fontWeight: '900'
  },
  removeFromCollection: {
    alignSelf: 'flex-end',
    paddingVertical: 7,
    paddingHorizontal: 6
  },
  removeFromCollectionText: {
    fontSize: 11,
    fontWeight: '700'
  },
  empty: {
    borderRadius: 22,
    padding: 19
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900'
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19
  },
  deleteButton: {
    minHeight: 48,
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  deleteText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '800'
  },
  editorBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end'
  },
  editorCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    paddingBottom: 38
  },
  routeEditorCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    paddingBottom: 34
  },
  editorTitle: {
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.7
  },
  editorHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18
  },
  editorInput: {
    minHeight: 56,
    marginTop: 16,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '700'
  },
  editorTextarea: {
    minHeight: 92,
    textAlignVertical: 'top'
  },
  editorLabel: {
    marginTop: 20,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  editorCities: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9
  },
  routeOptions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9
  },
  routeOption: {
    flex: 1,
    minHeight: 43,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: colors.darkSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  routeOptionActive: {
    backgroundColor: colors.green
  },
  routeOptionText: {
    color: '#A8B0AB',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center'
  },
  routeOptionTextActive: {
    color: colors.black
  },
  routeEditorPrivacy: {
    marginTop: 14,
    fontSize: 9,
    lineHeight: 14
  },
  editorCity: {
    flex: 1,
    height: 43,
    borderRadius: 15,
    backgroundColor: colors.darkSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  editorCityActive: {
    backgroundColor: colors.green
  },
  editorCityText: {
    color: '#A8B0AB',
    fontSize: 11,
    fontWeight: '900'
  },
  editorCityTextActive: {
    color: colors.black
  },
  editorActions: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 10
  },
  editorCancel: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center'
  },
  editorCancelText: {
    fontSize: 13,
    fontWeight: '800'
  },
  editorSave: {
    flex: 1.4,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  editorSaveDisabled: {
    opacity: 0.35
  },
  editorSaveText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
  }
});
