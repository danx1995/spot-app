import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native';

import {
  getSharedCollection,
  type SharedCollectionPreview
} from '../services/libraryApi';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import { SpotCard } from './SpotCard';

type Props = {
  collectionID: string | null;
  visible: boolean;
  onClose: () => void;
};

export function SharedCollectionImportModal({ collectionID, visible, onClose }: Props) {
  const dark = useColorScheme() === 'dark';
  const { collections, importSharedCollection } = useSpotStore();
  const [preview, setPreview] = useState<SharedCollectionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  useEffect(() => {
    if (!visible || !collectionID) {
      setPreview(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void getSharedCollection(collectionID)
      .then((value) => {
        if (active) setPreview(value);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Не удалось открыть подборку');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [collectionID, visible]);

  const alreadyImported = Boolean(
    preview && collections.some((collection) => collection.sourceCollectionId === preview.id)
  );

  function importPreview() {
    if (!preview) return;

    importSharedCollection({
      sourceCollectionId: preview.id,
      title: preview.title,
      subtitle: preview.subtitle,
      city: preview.city,
      cityLabel: preview.cityLabel,
      spots: preview.spots
    });

    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: text }]}>×</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Подборка из СПОТ</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <View style={styles.loadingMark}>
              <Text style={styles.loadingHeart}>♥</Text>
            </View>
            <ActivityIndicator color={colors.green} style={styles.spinner} />
            <Text style={[styles.loadingText, { color: muted }]}>Открываем подборку…</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.error}>
            <View style={styles.errorMark}><Text style={styles.errorMarkText}>!</Text></View>
            <Text style={[styles.errorTitle, { color: text }]}>Подборка недоступна</Text>
            <Text style={[styles.errorText, { color: muted }]}>{error}</Text>
            <Pressable onPress={onClose} style={styles.errorButton}>
              <Text style={styles.errorButtonText}>Закрыть</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && preview ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.hero}>
              <View style={styles.heroGlow} />
              <Text style={styles.heroHeart}>♥</Text>
            </View>

            <Text style={styles.city}>{preview.cityLabel.toUpperCase()}</Text>
            <Text style={[styles.title, { color: text }]}>{preview.title}</Text>
            <Text style={[styles.subtitle, { color: muted }]}>{preview.subtitle}</Text>

            <View style={[styles.infoCard, { backgroundColor: surface }]}>
              <View>
                <Text style={[styles.infoValue, { color: text }]}>{preview.spots.length}</Text>
                <Text style={[styles.infoLabel, { color: muted }]}>мест</Text>
              </View>
              <View style={styles.infoCopy}>
                <Text style={[styles.infoTitle, { color: text }]}>
                  {alreadyImported ? 'Подборка уже у тебя' : 'Можно добавить целиком'}
                </Text>
                <Text style={[styles.infoText, { color: muted }]}>
                  {alreadyImported
                    ? 'Импорт обновит список мест, а твои личные заметки и статусы сохранятся.'
                    : 'Все места сохранятся как «Хочу сюда» и появятся отдельной подборкой.'}
                </Text>
              </View>
            </View>

            <Pressable onPress={importPreview} style={styles.importButton}>
              <Text style={styles.importButtonText}>
                {alreadyImported ? '↻ Обновить подборку' : '♥ Добавить подборку в СПОТ'}
              </Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { color: muted }]}>МЕСТА В ПОДБОРКЕ</Text>

            {preview.spots.map((spot) => (
              <View key={spot.id} style={styles.spotWrap}>
                <SpotCard spot={spot} compact showCity />
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  header: {
    minHeight: 68,
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900'
  },
  headerSpacer: {
    width: 44
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60
  },
  loadingMark: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingHeart: {
    color: colors.black,
    fontSize: 27,
    fontWeight: '900'
  },
  spinner: {
    marginTop: 20
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700'
  },
  error: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingBottom: 60
  },
  errorMark: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.darkSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  errorMarkText: {
    color: colors.error,
    fontSize: 24,
    fontWeight: '900'
  },
  errorTitle: {
    marginTop: 17,
    fontSize: 20,
    fontWeight: '900'
  },
  errorText: {
    marginTop: 7,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19
  },
  errorButton: {
    marginTop: 18,
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  errorButtonText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '900'
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 50
  },
  hero: {
    height: 150,
    borderRadius: 28,
    backgroundColor: '#142119',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  heroGlow: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#1F5E42',
    opacity: 0.5
  },
  heroHeart: {
    color: colors.green,
    fontSize: 64,
    fontWeight: '900'
  },
  city: {
    marginTop: 22,
    color: colors.green,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  title: {
    marginTop: 6,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1
  },
  subtitle: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20
  },
  infoCard: {
    marginTop: 18,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center'
  },
  infoValue: {
    fontSize: 24,
    fontWeight: '900'
  },
  infoLabel: {
    marginTop: 1,
    fontSize: 10
  },
  infoCopy: {
    flex: 1
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '900'
  },
  infoText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16
  },
  importButton: {
    minHeight: 56,
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  importButtonText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
  },
  sectionLabel: {
    marginTop: 26,
    marginBottom: 9,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  spotWrap: {
    marginBottom: 10
  }
});
