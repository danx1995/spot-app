import React, { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';

import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { Spot, SpotStatus } from '../types';
import { getSpotOpenState, getTodayHoursLabel } from '../utils/openingHours';
import { savedContextLabel } from '../utils/savedContext';

type Props = {
  spot: Spot | null;
  visible: boolean;
  onClose: () => void;
};

const sourceLabels: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  '2gis': '2ГИС',
  yandex_maps: 'Яндекс Карты',
  web: 'Сайт'
};

const statusCopy: Record<SpotStatus, string> = {
  want: 'Хочу сюда',
  visited: 'Был здесь',
  booked: 'Забронировано'
};

function reviewsLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'отзывов';
  if (mod10 === 1) return 'отзыв';
  if (mod10 >= 2 && mod10 <= 4) return 'отзыва';
  return 'отзывов';
}

export function PlaceDetailModal({ spot, visible, onClose }: Props) {
  const dark = useColorScheme() === 'dark';
  const {
    collections,
    getSavedSpot,
    saveSpot,
    removeSpot,
    updateStatus,
    updateNote,
    toggleFavorite,
    togglePlaceInCollection
  } = useSpotStore();
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  const saved = spot ? getSavedSpot(spot.id) : undefined;
  const current = saved ?? spot;

  useEffect(() => {
    setEditingNote(false);
    setNoteDraft(current?.note ?? '');
  }, [current?.id, current?.note, visible]);

  if (!current) return null;
  const activeSpot: Spot = current;

  const status = saved?.status ?? 'want';
  const isHotel = activeSpot.category === 'hotel';
  const openState = getSpotOpenState(activeSpot);
  const todayHours = getTodayHoursLabel(activeSpot);
  const savedContext = saved ? savedContextLabel(activeSpot) : null;

  function ensureSaved(nextStatus: SpotStatus) {
    if (saved) {
      updateStatus(activeSpot.id, nextStatus);
    } else {
      saveSpot(activeSpot, nextStatus);
    }
  }

  function saveNote() {
    const note = noteDraft.trim();

    if (saved) {
      updateNote(activeSpot.id, note);
    } else {
      saveSpot({
        ...activeSpot,
        note: note || undefined
      }, 'want');
    }

    setEditingNote(false);
  }

  function openRoute() {
    const label = encodeURIComponent(activeSpot.name);
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${activeSpot.latitude},${activeSpot.longitude}&q=${label}`,
      android: `geo:0,0?q=${activeSpot.latitude},${activeSpot.longitude}(${label})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${activeSpot.latitude},${activeSpot.longitude}`
    });

    if (url) {
      void Linking.openURL(url);
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

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.category, { color: colors.green }]}>{activeSpot.categoryLabel.toUpperCase()}</Text>
          <Text style={[styles.title, { color: text }]}>{activeSpot.name}</Text>
          <Text style={[styles.meta, { color: muted }]}>
            {activeSpot.rating > 0 ? `★ ${activeSpot.rating.toFixed(1)}` : ''}
            {activeSpot.rating > 0 && activeSpot.reviewCount
              ? ` · ${activeSpot.reviewCount} ${reviewsLabel(activeSpot.reviewCount)}`
              : ''}
            {activeSpot.rating > 0 ? ' · ' : ''}{activeSpot.address}
          </Text>

          {openState.kind !== 'unknown' ? (
            <View style={styles.openBadge}>
              <View style={[
                styles.openBadgeDot,
                { backgroundColor: openState.kind === 'open' ? colors.green : muted }
              ]} />
              <Text style={[
                styles.openBadgeText,
                { color: openState.kind === 'open' ? colors.green : muted }
              ]}>
                {openState.label}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                if (!saved) saveSpot(current, 'want');
              }}
              style={[styles.primaryButton, saved && styles.primaryButtonSaved]}
            >
              <Text style={styles.primaryText}>
                {saved ? '✓ В СПОТ' : isHotel ? '♥ Хочу остановиться' : '♥ Хочу сюда'}
              </Text>
            </Pressable>

            <Pressable onPress={openRoute} style={[styles.secondaryButton, { backgroundColor: surface }]}>
              <Text style={[styles.secondaryText, { color: text }]}>Маршрут ↗</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => ensureSaved('visited')}
            style={[styles.fullSecondary, { backgroundColor: surface }]}
          >
            <Text style={[styles.secondaryText, { color: status === 'visited' ? colors.green : text }]}>
              {status === 'visited' ? '✓ Был здесь' : 'Отметить «Был здесь»'}
            </Text>
          </Pressable>

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
            <View style={styles.blockHeader}>
              <Text style={[styles.blockLabel, { color: muted }]}>ПОЧЕМУ СОХРАНЕНО</Text>
              <Pressable
                onPress={() => {
                  if (editingNote) {
                    saveNote();
                  } else {
                    setNoteDraft(activeSpot.note ?? '');
                    setEditingNote(true);
                  }
                }}
              >
                <Text style={styles.editText}>{editingNote ? 'Готово' : activeSpot.note ? 'Изменить' : '+ Заметка'}</Text>
              </Pressable>
            </View>

            {savedContext ? (
              <Text style={[styles.savedContext, { color: muted }]}>{savedContext}</Text>
            ) : null}

            {editingNote ? (
              <>
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  autoFocus
                  multiline
                  maxLength={500}
                  placeholder="Например: красивый интерьер, хочу попробовать тартар"
                  placeholderTextColor={muted}
                  style={[
                    styles.noteInput,
                    {
                      color: text,
                      backgroundColor: dark ? colors.darkSurfaceRaised : colors.lightMuted
                    }
                  ]}
                />
                <View style={styles.noteFooter}>
                  <Text style={[styles.noteCounter, { color: muted }]}>{noteDraft.length}/500</Text>
                  <Pressable
                    onPress={() => {
                      setNoteDraft(activeSpot.note ?? '');
                      setEditingNote(false);
                    }}
                  >
                    <Text style={[styles.cancelEdit, { color: muted }]}>Отмена</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={[styles.note, { color: activeSpot.note ? text : muted }]}>
                {activeSpot.note ?? 'Добавь короткую заметку — потом будет понятно, почему ты сохранил это место.'}
              </Text>
            )}
          </View>

          {activeSpot.description ? (
            <View style={[styles.block, { backgroundColor: surface }]}>
              <Text style={[styles.blockLabel, { color: muted }]}>ОПИСАНИЕ</Text>
              <Text style={[styles.description, { color: text }]}>{activeSpot.description}</Text>
            </View>
          ) : null}

          {activeSpot.sourceUrl ? (
            <Pressable
              onPress={() => void Linking.openURL(activeSpot.sourceUrl as string)}
              style={[styles.block, styles.sourceBlock, { backgroundColor: surface }]}
            >
              <View style={styles.sourceHeader}>
                <Text style={[styles.blockLabel, { color: muted }]}>ИСТОЧНИК</Text>
                <Text style={styles.sourceArrow}>↗</Text>
              </View>
              <Text style={[styles.sourceName, { color: text }]}>
                {sourceLabels[activeSpot.sourcePlatform ?? 'web'] ?? activeSpot.sourcePlatform ?? 'Ссылка'}
              </Text>
              <Text numberOfLines={1} style={[styles.sourceURL, { color: muted }]}>
                {activeSpot.sourceUrl}
              </Text>
            </Pressable>
          ) : null}

          {saved && collections.length > 0 ? (
            <View style={[styles.block, { backgroundColor: surface }]}>
              <Text style={[styles.blockLabel, { color: muted }]}>ПОДБОРКИ</Text>
              <View style={styles.collectionList}>
                {collections.map((collection) => {
                  const active = collection.placeIds.includes(activeSpot.id);
                  return (
                    <Pressable
                      key={collection.id}
                      onPress={() => togglePlaceInCollection(collection.id, activeSpot.id)}
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
              <Text style={[styles.infoValue, { color: text }]}>{activeSpot.cityLabel}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: muted }]}>Адрес</Text>
              <Text style={[styles.infoValue, { color: text }]}>{activeSpot.address}</Text>
            </View>
            {todayHours ? (
              <View style={styles.infoRow}>
                <Text style={[styles.infoKey, { color: muted }]}>Сегодня</Text>
                <Text style={[
                  styles.infoValue,
                  { color: openState.kind === 'open' ? colors.green : text }
                ]}>
                  {todayHours}
                </Text>
              </View>
            ) : null}
            {activeSpot.distanceMeters > 0 ? (
              <View style={styles.infoRow}>
                <Text style={[styles.infoKey, { color: muted }]}>От тебя</Text>
                <Text style={[styles.infoValue, { color: text }]}>
                  {activeSpot.distanceMeters < 1000
                    ? `${activeSpot.distanceMeters} м`
                    : `${(activeSpot.distanceMeters / 1000).toFixed(1).replace('.', ',')} км`}
                </Text>
              </View>
            ) : null}
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: muted }]}>Статус</Text>
              <Text style={[styles.infoValue, { color: saved ? colors.green : muted }]}>
                {saved ? statusCopy[status] : 'Не сохранено'}
              </Text>
            </View>
          </View>

          {saved ? (
            <View style={styles.manageRow}>
              <Pressable onPress={() => toggleFavorite(activeSpot.id)}>
                <Text style={[styles.manageText, { color: activeSpot.favorite ? colors.green : muted }]}>
                  {activeSpot.favorite ? '♥ Любимое' : '♡ В любимое'}
                </Text>
              </Pressable>
              <Pressable onPress={() => {
                removeSpot(activeSpot.id);
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
  openBadge: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  openBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  openBadgeText: {
    fontSize: 12,
    fontWeight: '900'
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20
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
    minWidth: 112,
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
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  blockLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  editText: {
    marginLeft: 'auto',
    color: colors.green,
    fontSize: 11,
    fontWeight: '900'
  },
  savedContext: {
    marginTop: 9,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800'
  },
  note: {
    marginTop: 9,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600'
  },
  description: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600'
  },
  noteInput: {
    minHeight: 108,
    marginTop: 12,
    padding: 13,
    borderRadius: 16,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    textAlignVertical: 'top'
  },
  noteFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  noteCounter: {
    fontSize: 10
  },
  cancelEdit: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: '800'
  },
  sourceBlock: {
    overflow: 'hidden'
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  sourceArrow: {
    marginLeft: 'auto',
    color: colors.green,
    fontSize: 18,
    fontWeight: '900'
  },
  sourceName: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '900'
  },
  sourceURL: {
    marginTop: 4,
    fontSize: 11
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
