import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';

import { ManualPlaceModal } from '../components/ManualPlaceModal';
import { PlaceDetailModal } from '../components/PlaceDetailModal';
import { SpotCard } from '../components/SpotCard';
import { searchPlaces } from '../services/api';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { Spot } from '../types';

export function AddScreen() {
  const dark = useColorScheme() === 'dark';
  const { selectedCity, setSelectedCity } = useSpotStore();
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;
  const cityLabel = selectedCity === 'spb' ? 'Петербург' : 'Москва';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    const normalized = query.trim();

    if (normalized.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    const timer = setTimeout(() => {
      void searchPlaces(normalized, selectedCity)
        .then((places) => {
          if (active) setResults(places);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, selectedCity]);

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <View style={styles.mark}><Text style={styles.markHeart}>♥</Text></View>
          <View style={styles.cityToggle}>
            <Pressable
              onPress={() => setSelectedCity('spb')}
              style={[styles.cityChip, selectedCity === 'spb' && styles.cityChipActive]}
            >
              <Text style={[styles.cityChipText, selectedCity === 'spb' && styles.cityChipTextActive]}>СПБ</Text>
            </Pressable>
            <Pressable
              onPress={() => setSelectedCity('moscow')}
              style={[styles.cityChip, selectedCity === 'moscow' && styles.cityChipActive]}
            >
              <Text style={[styles.cityChipText, selectedCity === 'moscow' && styles.cityChipTextActive]}>МСК</Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.title, { color: text }]}>Добавить в СПОТ</Text>
        <Text style={[styles.subtitle, { color: muted }]}>
          Ищем в городе: {cityLabel}. Город можно переключить сверху.
        </Text>

        <View style={[styles.searchBox, { backgroundColor: surface }]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            placeholder={`Название или адрес · ${cityLabel}`}
            placeholderTextColor={muted}
            style={[styles.searchInput, { color: text }]}
            returnKeyType="search"
          />
          {loading ? <ActivityIndicator color={colors.green} size="small" /> : null}
        </View>

        {query.trim().length >= 2 ? (
          <View style={styles.searchResults}>
            <View style={styles.resultsHeader}>
              <Text style={[styles.resultsTitle, { color: text }]}>Результаты</Text>
              {!loading && <Text style={[styles.resultsCount, { color: muted }]}>{results.length}</Text>}
            </View>

            {results.map((spot) => (
              <View key={spot.id} style={styles.resultCard}>
                <SpotCard spot={spot} compact onPress={() => setSelectedSpot(spot)} />
              </View>
            ))}

            {!loading && results.length === 0 ? (
              <Pressable
                onPress={() => setManualOpen(true)}
                style={[styles.empty, { backgroundColor: surface }]}
              >
                <Text style={[styles.emptyTitle, { color: text }]}>Не нашли такой спот</Text>
                <Text style={[styles.emptyText, { color: muted }]}>
                  Добавь его вручную и поставь точную метку на карте.
                </Text>
                <Text style={styles.emptyAction}>Добавить вручную →</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: muted }]}>ЕЩЁ СПОСОБЫ</Text>
            <View style={styles.actions}>
              <Pressable style={[styles.action, { backgroundColor: surface }]}>
                <View style={styles.actionIcon}><Text style={styles.actionSymbol}>↗</Text></View>
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionTitle, { color: text }]}>Вставить ссылку</Text>
                  <Text style={[styles.actionSubtitle, { color: muted }]}>Reels, TikTok, Telegram или сайт · скоро</Text>
                </View>
                <Text style={[styles.chevron, { color: muted }]}>›</Text>
              </Pressable>

              <Pressable onPress={() => setManualOpen(true)} style={[styles.action, { backgroundColor: surface }]}>
                <View style={styles.actionIcon}><Text style={styles.actionSymbol}>+</Text></View>
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionTitle, { color: text }]}>Добавить вручную</Text>
                  <Text style={[styles.actionSubtitle, { color: muted }]}>Название, категория и точка на карте</Text>
                </View>
                <Text style={[styles.chevron, { color: muted }]}>›</Text>
              </Pressable>
            </View>

            <View style={[styles.tip, { backgroundColor: dark ? colors.darkSurfaceRaised : '#E7F8F0' }]}>
              <Text style={styles.tipIcon}>✦</Text>
              <Text style={[styles.tipText, { color: text }]}>
                Следующий этап: отправляй Reel через «Поделиться → СПОТ», и приложение само определит место.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <PlaceDetailModal
        spot={selectedSpot}
        visible={Boolean(selectedSpot)}
        onClose={() => setSelectedSpot(null)}
      />

      <ManualPlaceModal
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingTop: 66,
    paddingHorizontal: 20,
    paddingBottom: 125
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  mark: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  markHeart: { color: colors.black, fontSize: 25 },
  cityToggle: {
    flexDirection: 'row',
    gap: 6
  },
  cityChip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: colors.darkSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cityChipActive: {
    backgroundColor: colors.green
  },
  cityChipText: {
    color: '#A7AEA9',
    fontSize: 12,
    fontWeight: '900'
  },
  cityChipTextActive: {
    color: colors.black
  },
  title: {
    marginTop: 22,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1
  },
  subtitle: {
    marginTop: 9,
    maxWidth: 330,
    fontSize: 15,
    lineHeight: 22
  },
  searchBox: {
    marginTop: 26,
    height: 58,
    borderRadius: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11
  },
  searchIcon: {
    color: colors.green,
    fontSize: 24,
    marginTop: -2
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600'
  },
  searchResults: {
    marginTop: 22
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  resultsTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800'
  },
  resultsCount: {
    fontSize: 13,
    fontWeight: '700'
  },
  resultCard: {
    marginBottom: 10
  },
  empty: {
    padding: 18,
    borderRadius: 22
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19
  },
  emptyAction: {
    marginTop: 12,
    color: colors.green,
    fontSize: 13,
    fontWeight: '900'
  },
  sectionLabel: {
    marginTop: 30,
    marginBottom: 10,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  actions: {
    gap: 10
  },
  action: {
    minHeight: 82,
    borderRadius: 22,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionSymbol: {
    color: colors.black,
    fontSize: 24,
    fontWeight: '900'
  },
  actionCopy: {
    flex: 1,
    marginLeft: 14
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  actionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17
  },
  chevron: {
    fontSize: 28,
    marginLeft: 8
  },
  tip: {
    marginTop: 18,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    gap: 12
  },
  tipIcon: {
    color: colors.green,
    fontSize: 20
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  }
});
