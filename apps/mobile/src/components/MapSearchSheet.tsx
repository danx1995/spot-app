import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { searchPlaces } from '../services/api';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { CitySlug, Spot } from '../types';
import { getSpotOpenState } from '../utils/openingHours';
import { SpotCard } from './SpotCard';

type Props = {
  visible: boolean;
  city: CitySlug;
  onClose: () => void;
  onSelect: (spot: Spot) => void;
};

const CITY_LABELS: Record<CitySlug, string> = {
  spb: 'Санкт-Петербург',
  moscow: 'Москва'
};

const RECENT_SEARCHES_PREFIX = '@spot/recent-searches/v1/';
const MAX_RECENT_SEARCHES = 6;

function normalizedSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function spotSearchText(spot: Spot) {
  return normalizedSearchText([
    spot.name,
    spot.address,
    spot.categoryLabel,
    spot.cityLabel,
    spot.note ?? ''
  ].join(' '));
}

function spotDedupeKey(spot: Spot) {
  return `${normalizedSearchText(spot.name)}|${normalizedSearchText(spot.address)}`;
}

function passesQuickFilters(spot: Spot, openNowOnly: boolean, highRatedOnly: boolean) {
  if (openNowOnly && getSpotOpenState(spot).kind !== 'open') return false;
  if (highRatedOnly && spot.rating < 4.5) return false;
  return true;
}

export function MapSearchSheet({ visible, city, onClose, onSelect }: Props) {
  const dark = useColorScheme() === 'dark';
  const { savedSpots } = useSpotStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Spot[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [highRatedOnly, setHighRatedOnly] = useState(false);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setLoading(false);
      setOpenNowOnly(false);
      setHighRatedOnly(false);
      return;
    }

    let active = true;
    void AsyncStorage.getItem(`${RECENT_SEARCHES_PREFIX}${city}`)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            setRecentSearches(
              parsed
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, MAX_RECENT_SEARCHES)
            );
          }
        } catch {
          setRecentSearches([]);
        }
      });

    return () => {
      active = false;
    };
  }, [city, visible]);

  useEffect(() => {
    if (!visible) return;

    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    const timer = setTimeout(() => {
      void searchPlaces(normalized, city)
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
  }, [city, query, visible]);

  const normalizedQuery = normalizedSearchText(query);

  const ownResults = useMemo(() => {
    if (normalizedQuery.length < 2) return [];

    return savedSpots
      .filter((spot) => spot.city === city)
      .filter((spot) => spotSearchText(spot).includes(normalizedQuery))
      .filter((spot) => passesQuickFilters(spot, openNowOnly, highRatedOnly))
      .slice(0, 8);
  }, [city, highRatedOnly, normalizedQuery, openNowOnly, savedSpots]);

  const newResults = useMemo(() => {
    const ownIDs = new Set(savedSpots.map((spot) => spot.id));
    const ownKeys = new Set(savedSpots.map(spotDedupeKey));
    const seen = new Set<string>();

    return results.filter((spot) => {
      if (!passesQuickFilters(spot, openNowOnly, highRatedOnly)) return false;
      if (ownIDs.has(spot.id) || ownKeys.has(spotDedupeKey(spot))) return false;

      const key = spotDedupeKey(spot);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [highRatedOnly, openNowOnly, results, savedSpots]);

  const filtersActive = openNowOnly || highRatedOnly;
  const hasVisibleResults = ownResults.length > 0 || newResults.length > 0;
  const hasUnfilteredResults = results.length > 0 || (
    normalizedQuery.length >= 2 &&
    savedSpots.some((spot) => spot.city === city && spotSearchText(spot).includes(normalizedQuery))
  );

  async function rememberSearch(value: string) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (normalized.length < 2) return;

    const next = [
      normalized,
      ...recentSearches.filter(
        (item) => normalizedSearchText(item) !== normalizedSearchText(normalized)
      )
    ].slice(0, MAX_RECENT_SEARCHES);

    setRecentSearches(next);
    await AsyncStorage.setItem(
      `${RECENT_SEARCHES_PREFIX}${city}`,
      JSON.stringify(next)
    );
  }

  function selectSpot(spot: Spot) {
    void rememberSearch(query);
    onSelect(spot);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: text }]}>×</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerTitle, { color: text }]}>Найти на карте</Text>
            <Text style={[styles.headerCity, { color: muted }]}>{CITY_LABELS[city]}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.searchBox, { backgroundColor: surface }]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            placeholder="Название или адрес"
            placeholderTextColor={muted}
            style={[styles.searchInput, { color: text }]}
            returnKeyType="search"
            onSubmitEditing={() => void rememberSearch(query)}
          />
          {query.length > 0 && !loading ? (
            <Pressable onPress={() => setQuery('')} style={styles.clearButton}>
              <Text style={[styles.clearText, { color: muted }]}>×</Text>
            </Pressable>
          ) : null}
          {loading ? <ActivityIndicator color={colors.green} size="small" /> : null}
        </View>

        <View style={styles.quickFilters}>
          <Pressable
            onPress={() => setOpenNowOnly((current) => !current)}
            style={[
              styles.quickFilter,
              { backgroundColor: openNowOnly ? colors.green : surface }
            ]}
          >
            <Text style={[
              styles.quickFilterText,
              { color: openNowOnly ? colors.black : text }
            ]}>
              ● Открыто сейчас
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setHighRatedOnly((current) => !current)}
            style={[
              styles.quickFilter,
              { backgroundColor: highRatedOnly ? colors.green : surface }
            ]}
          >
            <Text style={[
              styles.quickFilterText,
              { color: highRatedOnly ? colors.black : text }
            ]}>
              ★ 4.5+
            </Text>
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {query.trim().length < 2 ? (
            <>
              {recentSearches.length > 0 ? (
                <View style={styles.recentBlock}>
                  <View style={styles.resultsHeader}>
                    <Text style={[styles.resultsTitle, { color: text }]}>Недавние запросы</Text>
                    <Pressable
                      onPress={() => {
                        setRecentSearches([]);
                        void AsyncStorage.removeItem(`${RECENT_SEARCHES_PREFIX}${city}`);
                      }}
                    >
                      <Text style={[styles.clearHistory, { color: muted }]}>Очистить</Text>
                    </Pressable>
                  </View>
                  <View style={styles.recentList}>
                    {recentSearches.map((item) => (
                      <Pressable
                        key={item}
                        onPress={() => setQuery(item)}
                        style={[styles.recentChip, { backgroundColor: surface }]}
                      >
                        <Text style={[styles.recentIcon, { color: muted }]}>↺</Text>
                        <Text style={[styles.recentText, { color: text }]} numberOfLines={1}>{item}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>⌖</Text></View>
                  <Text style={[styles.emptyTitle, { color: text }]}>Ищи любое место</Text>
                  <Text style={[styles.emptyText, { color: muted }]}>
                    Сначала покажем твои сохранённые споты, затем новые места в {CITY_LABELS[city]}.
                  </Text>
                </View>
              )}
            </>
          ) : null}

          {!loading && query.trim().length >= 2 && !hasVisibleResults ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: text }]}>
                {hasUnfilteredResults && filtersActive ? 'Нет мест по фильтрам' : 'Ничего не нашли'}
              </Text>
              <Text style={[styles.emptyText, { color: muted }]}>
                {hasUnfilteredResults && filtersActive
                  ? 'Отключи один из фильтров — покажем остальные найденные места.'
                  : 'Попробуй название без лишних слов или добавь место вручную через «+».'}
              </Text>
            </View>
          ) : null}

          {ownResults.length > 0 ? (
            <View style={styles.results}>
              <View style={styles.resultsHeader}>
                <View>
                  <Text style={[styles.resultsTitle, { color: text }]}>Мои споты</Text>
                  <Text style={[styles.resultsSubtitle, { color: muted }]}>Уже сохранены у тебя</Text>
                </View>
                <Text style={[styles.resultsCount, { color: colors.green }]}>{ownResults.length}</Text>
              </View>
              {ownResults.map((spot) => (
                <View key={spot.id} style={styles.resultCard}>
                  <SpotCard spot={spot} compact onPress={() => selectSpot(spot)} />
                </View>
              ))}
            </View>
          ) : null}

          {newResults.length > 0 ? (
            <View style={[styles.results, ownResults.length > 0 && styles.resultsSeparated]}>
              <View style={styles.resultsHeader}>
                <View>
                  <Text style={[styles.resultsTitle, { color: text }]}>Новые места</Text>
                  <Text style={[styles.resultsSubtitle, { color: muted }]}>Можно добавить в СПОТ</Text>
                </View>
                <Text style={[styles.resultsCount, { color: muted }]}>{newResults.length}</Text>
              </View>
              {newResults.map((spot) => (
                <View key={spot.id} style={styles.resultCard}>
                  <SpotCard spot={spot} compact onPress={() => selectSpot(spot)} />
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
    minHeight: 74,
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '900'
  },
  headerCity: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700'
  },
  headerSpacer: {
    width: 44
  },
  searchBox: {
    height: 58,
    marginHorizontal: 18,
    borderRadius: 20,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  searchIcon: {
    color: colors.green,
    fontSize: 24,
    marginTop: -2
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700'
  },
  clearButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center'
  },
  clearText: {
    fontSize: 22
  },
  quickFilters: {
    marginTop: 10,
    paddingHorizontal: 18,
    flexDirection: 'row',
    gap: 8
  },
  quickFilter: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickFilterText: {
    fontSize: 11,
    fontWeight: '900'
  },
  content: {
    padding: 18,
    paddingBottom: 44
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 72,
    paddingHorizontal: 28
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyIconText: {
    color: colors.black,
    fontSize: 25,
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
  },
  recentBlock: {
    paddingTop: 4
  },
  recentList: {
    marginTop: 10,
    gap: 8
  },
  recentChip: {
    minHeight: 50,
    borderRadius: 17,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  recentIcon: {
    fontSize: 17,
    fontWeight: '800'
  },
  recentText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800'
  },
  clearHistory: {
    fontSize: 11,
    fontWeight: '800'
  },
  results: {
    paddingTop: 2
  },
  resultsSeparated: {
    marginTop: 22,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#77807A33'
  },
  resultsHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '900'
  },
  resultsSubtitle: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700'
  },
  resultsCount: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '800'
  },
  resultCard: {
    marginBottom: 10
  }
});
