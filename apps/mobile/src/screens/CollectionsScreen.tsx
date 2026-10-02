import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';

import { CollectionDetailModal } from '../components/CollectionDetailModal';
import { SharedCollectionImportModal } from '../components/SharedCollectionImportModal';
import { useInboundImport } from '../state/InboundImport';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { CitySlug } from '../types';

type CollectionCity = CitySlug | 'both';

export function CollectionsScreen() {
  const dark = useColorScheme() === 'dark';
  const { collections, createCollection } = useSpotStore();
  const { pendingCollectionID, consumePendingCollection } = useInboundImport();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [selectedCollectionID, setSelectedCollectionID] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [city, setCity] = useState<CollectionCity>('spb');
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionID) ?? null,
    [collections, selectedCollectionID]
  );

  function submit() {
    const value = title.trim();
    if (!value) return;

    const created = createCollection({ title: value, city });
    setTitle('');
    setCreatorOpen(false);
    setSelectedCollectionID(created.id);
  }

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: text }]}>Подборки</Text>
          <Text style={[styles.subtitle, { color: muted }]}>Места по поездкам и настроению.</Text>
        </View>
        <Pressable onPress={() => setCreatorOpen(true)} style={styles.addButton}>
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>

      <FlatList
        data={collections}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => setSelectedCollectionID(item.id)}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: surface, opacity: pressed ? 0.92 : 1 }
            ]}
          >
            <View style={[
              styles.cover,
              index === 0 && styles.coverFeatured,
              item.routePlan && styles.coverRoute
            ]}>
              {item.routePlan ? <Text style={styles.routeKicker}>МАРШРУТ</Text> : null}
              <Text style={styles.coverHeart}>
                {item.routePlan ? '⌁' : index === 0 ? '♥' : '●'}
              </Text>
            </View>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: text }]}>{item.title}</Text>
            <Text style={[styles.cardMeta, { color: muted }]}>
              {item.routePlan
                ? String(item.placeIds.length) + ' точек · ' +
                  (item.routePlan.transport === 'driving' ? 'на машине' : 'пешком')
                : String(item.placeIds.length) + ' ' +
                  (item.placeIds.length === 1 ? 'место' : 'мест')}
            </Text>
            <Text numberOfLines={1} style={[styles.cardCity, { color: muted }]}>
              {item.routePlan
                ? item.cityLabel + ' · ' +
                  (item.routePlan.startPreset === 'tomorrow'
                    ? 'завтра'
                    : item.routePlan.startPreset === 'evening'
                      ? 'вечером'
                      : 'сейчас')
                : item.cityLabel}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: text }]}>Создай первую подборку</Text>
            <Text style={[styles.emptyText, { color: muted }]}>Например «Свидания», «Москва на выходные» или «Отели».</Text>
          </View>
        }
      />

      <Modal visible={creatorOpen} transparent animationType="fade" onRequestClose={() => setCreatorOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: dark ? '#151B17' : colors.white }]}>
            <Text style={[styles.modalTitle, { color: text }]}>Новая подборка</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              autoFocus
              placeholder="Например: Москва на выходные"
              placeholderTextColor={muted}
              style={[styles.input, { color: text, backgroundColor: dark ? colors.darkSurfaceRaised : colors.lightMuted }]}
              returnKeyType="done"
              onSubmitEditing={submit}
            />

            <Text style={[styles.modalLabel, { color: muted }]}>ГОРОД</Text>
            <View style={styles.cityRow}>
              {([
                ['spb', 'СПБ'],
                ['moscow', 'МСК'],
                ['both', 'Оба']
              ] as const).map(([id, label]) => (
                <Pressable
                  key={id}
                  onPress={() => setCity(id)}
                  style={[styles.cityChip, city === id && styles.cityChipActive]}
                >
                  <Text style={[styles.cityText, city === id && styles.cityTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreatorOpen(false)} style={styles.cancelButton}>
                <Text style={[styles.cancelText, { color: muted }]}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={!title.trim()}
                style={[styles.createButton, !title.trim() && styles.createButtonDisabled]}
              >
                <Text style={styles.createText}>Создать</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <CollectionDetailModal
        collection={selectedCollection}
        visible={Boolean(selectedCollection) && !pendingCollectionID}
        onClose={() => setSelectedCollectionID(null)}
      />

      <SharedCollectionImportModal
        collectionID={pendingCollectionID}
        visible={Boolean(pendingCollectionID)}
        onClose={consumePendingCollection}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 64,
    paddingHorizontal: 18
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  headerCopy: {
    flex: 1
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1
  },
  subtitle: {
    marginTop: 7,
    fontSize: 14
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addButtonText: {
    color: colors.black,
    fontSize: 27,
    fontWeight: '700'
  },
  grid: {
    paddingTop: 22,
    paddingBottom: 120
  },
  row: {
    gap: 12,
    marginBottom: 12
  },
  card: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    paddingBottom: 15
  },
  cover: {
    height: 132,
    marginBottom: 14,
    backgroundColor: '#1A2520',
    alignItems: 'center',
    justifyContent: 'center'
  },
  coverFeatured: {
    backgroundColor: '#173528'
  },
  coverRoute: {
    backgroundColor: '#142119',
    borderWidth: 1,
    borderColor: '#244432'
  },
  routeKicker: {
    position: 'absolute',
    top: 13,
    left: 13,
    color: colors.green,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2
  },
  coverHeart: {
    color: colors.green,
    fontSize: 40,
    fontWeight: '900'
  },
  cardTitle: {
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '800'
  },
  cardMeta: {
    paddingHorizontal: 14,
    marginTop: 5,
    fontSize: 13
  },
  cardCity: {
    paddingHorizontal: 14,
    marginTop: 3,
    fontSize: 11
  },
  empty: {
    paddingTop: 70,
    alignItems: 'center'
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '900'
  },
  emptyText: {
    marginTop: 7,
    maxWidth: 280,
    textAlign: 'center',
    lineHeight: 19
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end'
  },
  modalCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    paddingBottom: 38
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.7
  },
  input: {
    height: 58,
    borderRadius: 18,
    paddingHorizontal: 16,
    marginTop: 18,
    fontSize: 15,
    fontWeight: '700'
  },
  modalLabel: {
    marginTop: 20,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5
  },
  cityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9
  },
  cityChip: {
    flex: 1,
    height: 43,
    borderRadius: 16,
    backgroundColor: colors.darkSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cityChipActive: {
    backgroundColor: colors.green
  },
  cityText: {
    color: '#A7AEA9',
    fontSize: 12,
    fontWeight: '900'
  },
  cityTextActive: {
    color: colors.black
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24
  },
  cancelButton: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '800'
  },
  createButton: {
    flex: 1.4,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  createButtonDisabled: {
    opacity: 0.35
  },
  createText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
  }
});
