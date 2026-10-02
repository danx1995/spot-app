import React, { useEffect, useState } from 'react';
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
import { colors } from '../theme';
import type { CitySlug, Spot } from '../types';
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

export function MapSearchSheet({ visible, city, onClose, onSelect }: Props) {
  const dark = useColorScheme() === 'dark';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(false);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setLoading(false);
    }
  }, [visible]);

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
          />
          {query.length > 0 && !loading ? (
            <Pressable onPress={() => setQuery('')} style={styles.clearButton}>
              <Text style={[styles.clearText, { color: muted }]}>×</Text>
            </Pressable>
          ) : null}
          {loading ? <ActivityIndicator color={colors.green} size="small" /> : null}
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {query.trim().length < 2 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>⌖</Text></View>
              <Text style={[styles.emptyTitle, { color: text }]}>Ищи любое место</Text>
              <Text style={[styles.emptyText, { color: muted }]}>
                Ресторан, кофейню, бар, отель или адрес в {CITY_LABELS[city]}.
              </Text>
            </View>
          ) : null}

          {!loading && query.trim().length >= 2 && results.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: text }]}>Ничего не нашли</Text>
              <Text style={[styles.emptyText, { color: muted }]}>
                Попробуй название без лишних слов или добавь место вручную через «+».
              </Text>
            </View>
          ) : null}

          {results.length > 0 ? (
            <View style={styles.results}>
              <View style={styles.resultsHeader}>
                <Text style={[styles.resultsTitle, { color: text }]}>Места</Text>
                <Text style={[styles.resultsCount, { color: muted }]}>{results.length}</Text>
              </View>
              {results.map((spot) => (
                <View key={spot.id} style={styles.resultCard}>
                  <SpotCard
                    spot={spot}
                    compact
                    onPress={() => {
                      onSelect(spot);
                      onClose();
                    }}
                  />
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
  results: {
    paddingTop: 2
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  resultsTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900'
  },
  resultsCount: {
    fontSize: 12,
    fontWeight: '700'
  },
  resultCard: {
    marginBottom: 10
  }
});
