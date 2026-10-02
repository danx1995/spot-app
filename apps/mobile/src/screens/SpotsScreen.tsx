import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';

import { CategoryChip } from '../components/CategoryChip';
import { PlaceDetailModal } from '../components/PlaceDetailModal';
import { SpotCard } from '../components/SpotCard';
import { categories } from '../data/mock';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { CitySlug, Spot, SpotCategory, SpotStatus } from '../types';

type StatusFilter = 'all' | SpotStatus;
type CityFilter = 'all' | CitySlug;
type CategoryFilter = 'all' | SpotCategory;
type SortMode = 'recent' | 'name';

const statusFilters: Array<[StatusFilter, string]> = [
  ['all', 'Все'],
  ['want', 'Хочу'],
  ['visited', 'Был'],
  ['booked', 'Бронь']
];

const cityFilters: Array<[CityFilter, string]> = [
  ['all', 'Все города'],
  ['spb', 'СПБ'],
  ['moscow', 'МСК']
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/ё/g, 'е');
}

export function SpotsScreen() {
  const dark = useColorScheme() === 'dark';
  const { savedSpots } = useSpotStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [cityFilter, setCityFilter] = useState<CityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [query, setQuery] = useState('');
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;
  const raised = dark ? colors.darkSurfaceRaised : colors.lightMuted;

  const filtered = useMemo(() => {
    const q = normalize(query);

    const items = savedSpots.filter((spot) => {
      if (statusFilter !== 'all' && spot.status !== statusFilter) return false;
      if (cityFilter !== 'all' && spot.city !== cityFilter) return false;
      if (categoryFilter !== 'all' && spot.category !== categoryFilter) return false;
      if (favoriteOnly && !spot.favorite) return false;

      if (q) {
        const haystack = normalize([
          spot.name,
          spot.address,
          spot.categoryLabel,
          spot.cityLabel,
          spot.note ?? '',
          spot.sourcePlatform ?? ''
        ].join(' '));

        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    if (sortMode === 'name') {
      return [...items].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }

    return items;
  }, [
    categoryFilter,
    cityFilter,
    favoriteOnly,
    query,
    savedSpots,
    sortMode,
    statusFilter
  ]);

  const activeFilterCount = [
    statusFilter !== 'all',
    cityFilter !== 'all',
    categoryFilter !== 'all',
    favoriteOnly,
    query.trim().length > 0
  ].filter(Boolean).length;

  function resetFilters() {
    setStatusFilter('all');
    setCityFilter('all');
    setCategoryFilter('all');
    setFavoriteOnly(false);
    setQuery('');
  }

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: text }]}>Мои споты</Text>
          <Text style={[styles.count, { color: muted }]}>
            {filtered.length} из {savedSpots.length} · Москва и Петербург
          </Text>
        </View>

        <Pressable
          onPress={() => setSortMode((current) => current === 'recent' ? 'name' : 'recent')}
          style={[styles.sortButton, { backgroundColor: surface }]}
        >
          <Text style={[styles.sortIcon, { color: colors.green }]}>
            {sortMode === 'recent' ? '↕' : 'А'}
          </Text>
          <Text style={[styles.sortText, { color: text }]}>
            {sortMode === 'recent' ? 'Недавние' : 'По имени'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.searchBox, { backgroundColor: surface }]}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          placeholder="Найти в своих спотах"
          placeholderTextColor={muted}
          style={[styles.searchInput, { color: text }]}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} style={styles.clearButton}>
            <Text style={[styles.clearText, { color: muted }]}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.statusRow}>
        {statusFilters.map(([id, label]) => {
          const active = statusFilter === id;
          return (
            <Pressable
              key={id}
              onPress={() => setStatusFilter(id)}
              style={[
                styles.statusChip,
                { backgroundColor: active ? colors.green : raised }
              ]}
            >
              <Text style={[styles.statusText, { color: active ? colors.black : text }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.secondaryFilters}>
        <View style={styles.cityRow}>
          {cityFilters.map(([id, label]) => {
            const active = cityFilter === id;
            return (
              <Pressable
                key={id}
                onPress={() => setCityFilter(id)}
                style={[
                  styles.cityChip,
                  { backgroundColor: active ? colors.green : surface }
                ]}
              >
                <Text style={[styles.cityText, { color: active ? colors.black : text }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => setFavoriteOnly((current) => !current)}
          style={[
            styles.favoriteChip,
            { backgroundColor: favoriteOnly ? colors.green : surface }
          ]}
        >
          <Text style={[styles.favoriteText, { color: favoriteOnly ? colors.black : text }]}>
            {favoriteOnly ? '♥ Любимые' : '♡ Любимые'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categories}
      >
        {categories.map((item) => (
          <CategoryChip
            key={item.id}
            label={item.label}
            active={categoryFilter === item.id}
            onPress={() => setCategoryFilter(item.id as CategoryFilter)}
          />
        ))}
      </ScrollView>

      {activeFilterCount > 0 ? (
        <View style={styles.filterSummary}>
          <Text style={[styles.filterSummaryText, { color: muted }]}>
            Активных фильтров: {activeFilterCount}
          </Text>
          <Pressable onPress={resetFilters}>
            <Text style={styles.resetText}>Сбросить</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          filtered.length === 0 && styles.listEmpty
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <SpotCard
            spot={item}
            compact
            showCity={cityFilter === 'all'}
            onPress={() => setSelectedSpot(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>♥</Text></View>
            <Text style={[styles.emptyTitle, { color: text }]}>
              {savedSpots.length === 0 ? 'Здесь пока пусто' : 'Ничего не подходит'}
            </Text>
            <Text style={[styles.empty, { color: muted }]}>
              {savedSpots.length === 0
                ? 'Найди новое место через «+» и сохрани его в СПОТ.'
                : 'Попробуй изменить поиск или сбросить фильтры.'}
            </Text>
            {savedSpots.length > 0 ? (
              <Pressable onPress={resetFilters} style={styles.emptyReset}>
                <Text style={styles.emptyResetText}>Сбросить фильтры</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />

      <PlaceDetailModal
        spot={selectedSpot}
        visible={Boolean(selectedSpot)}
        onClose={() => setSelectedSpot(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 18
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  headerCopy: {
    flex: 1
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1
  },
  count: {
    marginTop: 5,
    fontSize: 13
  },
  sortButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  sortIcon: {
    fontSize: 15,
    fontWeight: '900'
  },
  sortText: {
    fontSize: 11,
    fontWeight: '800'
  },
  searchBox: {
    marginTop: 20,
    height: 54,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  searchIcon: {
    color: colors.green,
    fontSize: 22,
    marginTop: -2
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600'
  },
  clearButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  clearText: {
    fontSize: 20
  },
  statusRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 7
  },
  statusChip: {
    flex: 1,
    minHeight: 39,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800'
  },
  secondaryFilters: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8
  },
  cityRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6
  },
  cityChip: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cityText: {
    fontSize: 10,
    fontWeight: '900'
  },
  favoriteChip: {
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  favoriteText: {
    fontSize: 10,
    fontWeight: '900'
  },
  categories: {
    paddingTop: 12,
    gap: 7
  },
  filterSummary: {
    minHeight: 34,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center'
  },
  filterSummaryText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700'
  },
  resetText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '900'
  },
  list: {
    paddingTop: 10,
    paddingBottom: 130
  },
  listEmpty: {
    flexGrow: 1
  },
  separator: {
    height: 10
  },
  emptyBlock: {
    flex: 1,
    paddingTop: 46,
    alignItems: 'center'
  },
  emptyMark: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyMarkText: {
    color: colors.black,
    fontSize: 25,
    fontWeight: '900'
  },
  emptyTitle: {
    marginTop: 17,
    fontSize: 19,
    fontWeight: '900'
  },
  empty: {
    marginTop: 7,
    maxWidth: 280,
    textAlign: 'center',
    lineHeight: 19
  },
  emptyReset: {
    minHeight: 44,
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 15,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyResetText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '900'
  }
});
