import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native';

import { publishCollection } from '../services/libraryApi';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { Collection, Spot } from '../types';
import { PlaceDetailModal } from './PlaceDetailModal';
import { SpotCard } from './SpotCard';

type Props = {
  collection: Collection | null;
  visible: boolean;
  onClose: () => void;
};

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
  const { savedSpots, togglePlaceInCollection, deleteCollection, syncNow } = useSpotStore();
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [sharing, setSharing] = useState(false);

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

  function removePlace(placeID: string) {
    togglePlaceInCollection(activeCollection.id, placeID);
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
            <Text style={styles.heroHeart}>♥</Text>
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
              </View>
              <View style={[styles.count, { backgroundColor: surface }]}>
                <Text style={[styles.countValue, { color: text }]}>{spots.length}</Text>
                <Text style={[styles.countLabel, { color: muted }]}>мест</Text>
              </View>
            </View>

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
              spots.map((spot) => (
                <View key={spot.id} style={styles.spotWrap}>
                  <SpotCard spot={spot} compact onPress={() => setSelectedSpot(spot)} />
                  <Pressable onPress={() => removePlace(spot.id)} style={styles.removeFromCollection}>
                    <Text style={[styles.removeFromCollectionText, { color: muted }]}>Убрать из подборки</Text>
                  </Pressable>
                </View>
              ))
            )}

            <Pressable onPress={confirmDelete} style={styles.deleteButton}>
              <Text style={styles.deleteText}>Удалить подборку</Text>
            </Pressable>
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
  removeFromCollection: {
    alignSelf: 'flex-end',
    paddingTop: 7,
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
  }
});
