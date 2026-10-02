import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';

import { importPlaceLink, searchPlaces, type LinkImportResult } from '../services/api';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { Spot } from '../types';
import { SpotCard } from './SpotCard';

type Props = {
  visible: boolean;
  initialURL?: string;
  initialHint?: string;
  onClose: () => void;
};

const platformLabels: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  '2gis': '2ГИС',
  yandex_maps: 'Яндекс Карты',
  web: 'Сайт'
};

export function LinkImportModal({ visible, initialURL, initialHint, onClose }: Props) {
  const dark = useColorScheme() === 'dark';
  const { selectedCity, saveSpot } = useSpotStore();

  const [url, setURL] = useState('');
  const [result, setResult] = useState<LinkImportResult | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  const sourceLabel = useMemo(
    () => result ? (platformLabels[result.platform] ?? result.platform) : '',
    [result]
  );

  useEffect(() => {
    if (visible) return;
    setURL('');
    setResult(null);
    setPlaceQuery('');
    setPlaceResults([]);
    setLoading(false);
    setSearching(false);
    setError(null);
  }, [visible]);

  useEffect(() => {
    if (!visible || !initialURL) return;
    setURL(initialURL);
    void resolveLink(initialURL, initialHint);
  }, [initialHint, initialURL, visible]);

  useEffect(() => {
    if (!result || result.status !== 'needs_context') return;

    const query = placeQuery.trim();
    if (query.length < 2) {
      setPlaceResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);

    const timer = setTimeout(() => {
      void searchPlaces(query, selectedCity)
        .then((places) => {
          if (!active) return;
          setPlaceResults(places.map((place) => ({
            ...place,
            sourceUrl: result.source_url,
            sourcePlatform: result.platform
          })));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [placeQuery, result, selectedCity]);

  async function resolveLink(candidateURL?: string, candidateHint?: string) {
    const target = (candidateURL ?? url).trim();
    if (!target || loading) return;

    if (candidateURL) {
      setURL(target);
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setPlaceQuery('');
    setPlaceResults([]);

    try {
      const imported = await importPlaceLink(target, selectedCity, candidateHint);
      setResult(imported);

      if (imported.status === 'needs_context') {
        if (imported.suggestedQuery) {
          setPlaceQuery(imported.suggestedQuery);
        }
        if (imported.candidates.length > 0) {
          setPlaceResults(imported.candidates);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось обработать ссылку');
    } finally {
      setLoading(false);
    }
  }

  function saveAndClose(spot: Spot) {
    saveSpot(spot, 'want');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: text }]}>×</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Добавить по ссылке</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.heroIcon}>
            <Text style={styles.heroIconText}>↗</Text>
          </View>
          <Text style={[styles.title, { color: text }]}>Вставь ссылку на место</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Прямые ссылки 2ГИС определяем автоматически. Reels, TikTok и Telegram уже можно привязать к споту вручную.
          </Text>

          <View style={[styles.urlBox, { backgroundColor: surface }]}>
            <TextInput
              value={url}
              onChangeText={setURL}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://…"
              placeholderTextColor={muted}
              style={[styles.urlInput, { color: text }]}
              onSubmitEditing={() => void resolveLink()}
              returnKeyType="go"
            />
          </View>

          <Pressable
            onPress={() => void resolveLink()}
            disabled={!url.trim() || loading}
            style={[styles.primaryButton, (!url.trim() || loading) && styles.disabled]}
          >
            {loading ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.primaryText}>Найти спот</Text>
            )}
          </Pressable>

          {error ? (
            <View style={[styles.messageCard, { backgroundColor: surface }]}>
              <Text style={[styles.errorTitle, { color: colors.error }]}>Не получилось</Text>
              <Text style={[styles.messageText, { color: muted }]}>{error}</Text>
            </View>
          ) : null}

          {result?.status === 'resolved' && result.place ? (
            <View style={styles.resultSection}>
              <View style={styles.sourceRow}>
                <View style={styles.sourceBadge}>
                  <Text style={styles.sourceBadgeText}>{sourceLabel}</Text>
                </View>
                <Text style={[styles.foundText, { color: muted }]}>Место найдено автоматически</Text>
              </View>

              <SpotCard spot={result.place} compact />

              <Pressable onPress={() => saveAndClose(result.place as Spot)} style={styles.saveButton}>
                <Text style={styles.saveText}>♥ Сохранить в СПОТ</Text>
              </Pressable>
            </View>
          ) : null}

          {result?.status === 'needs_context' ? (
            <View style={styles.resultSection}>
              <View style={styles.sourceRow}>
                <View style={styles.sourceBadge}>
                  <Text style={styles.sourceBadgeText}>{sourceLabel}</Text>
                </View>
                <Text style={[styles.foundText, { color: muted }]}>
                  {result.candidates.length > 0 ? 'СПОТ уже нашёл варианты' : 'Источник распознан'}
                </Text>
              </View>

              <View style={[styles.messageCard, { backgroundColor: surface }]}>
                <Text style={[styles.messageTitle, { color: text }]}>Ссылка сохранится вместе со спотом</Text>
                <Text style={[styles.messageText, { color: muted }]}>
                  {result.message ?? 'Напиши название места, чтобы привязать источник к карточке.'}
                </Text>
              </View>

              <Text style={[styles.label, { color: muted }]}>КАКОЕ ЭТО МЕСТО?</Text>
              <View style={[styles.searchBox, { backgroundColor: surface }]}>
                <TextInput
                  value={placeQuery}
                  onChangeText={setPlaceQuery}
                  autoCorrect={false}
                  placeholder="Например: Birch"
                  placeholderTextColor={muted}
                  style={[styles.searchInput, { color: text }]}
                />
                {searching ? <ActivityIndicator color={colors.green} size="small" /> : null}
              </View>

              {placeResults.length > 0 ? (
                <Text style={[styles.tapHint, { color: muted }]}>Нажми на место — оно сразу сохранится с источником.</Text>
              ) : null}

              {placeResults.map((spot) => (
                <View key={spot.id} style={styles.placeResult}>
                  <SpotCard spot={spot} compact onPress={() => saveAndClose(spot)} />
                </View>
              ))}
            </View>
          ) : null}
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
    minHeight: 66,
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48
  },
  heroIcon: {
    marginTop: 18,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroIconText: {
    color: colors.black,
    fontSize: 27,
    fontWeight: '900'
  },
  title: {
    marginTop: 20,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.9
  },
  subtitle: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21
  },
  urlBox: {
    height: 58,
    marginTop: 24,
    borderRadius: 19,
    paddingHorizontal: 16,
    justifyContent: 'center'
  },
  urlInput: {
    fontSize: 14,
    fontWeight: '700'
  },
  primaryButton: {
    height: 56,
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryText: {
    color: colors.black,
    fontSize: 15,
    fontWeight: '900'
  },
  disabled: {
    opacity: 0.38
  },
  resultSection: {
    marginTop: 24
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12
  },
  sourceBadge: {
    paddingHorizontal: 10,
    height: 29,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sourceBadgeText: {
    color: colors.black,
    fontSize: 10,
    fontWeight: '900'
  },
  foundText: {
    fontSize: 12,
    fontWeight: '700'
  },
  saveButton: {
    minHeight: 56,
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
  },
  messageCard: {
    marginTop: 14,
    borderRadius: 20,
    padding: 16
  },
  messageTitle: {
    fontSize: 15,
    fontWeight: '900'
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '900'
  },
  messageText: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19
  },
  label: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  searchBox: {
    minHeight: 56,
    borderRadius: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700'
  },
  tapHint: {
    marginTop: 10,
    marginBottom: 2,
    fontSize: 11,
    lineHeight: 16
  },
  placeResult: {
    marginTop: 10
  }
});
