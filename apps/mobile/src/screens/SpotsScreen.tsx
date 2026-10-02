import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { PlaceDetailModal } from '../components/PlaceDetailModal';
import { SpotCard } from '../components/SpotCard';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { Spot, SpotStatus } from '../types';

type Filter = 'all' | SpotStatus;

export function SpotsScreen() {
  const dark = useColorScheme() === 'dark';
  const { savedSpots } = useSpotStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const filtered = useMemo(
    () => filter === 'all' ? savedSpots : savedSpots.filter((spot) => spot.status === filter),
    [filter, savedSpots]
  );

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <Text style={[styles.title, { color: text }]}>Мои споты</Text>
      <Text style={[styles.count, { color: muted }]}>{savedSpots.length} сохранено · Москва и Петербург</Text>

      <View style={styles.tabs}>
        {[
          ['all', 'Все'],
          ['want', 'Хочу'],
          ['visited', 'Был'],
          ['booked', 'Бронь']
        ].map(([id, label]) => {
          const active = filter === id;
          return (
            <Pressable
              key={id}
              onPress={() => setFilter(id as Filter)}
              style={[styles.tab, active && { backgroundColor: colors.green }]}
            >
              <Text style={[styles.tabText, { color: active ? colors.black : text }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <SpotCard spot={item} compact onPress={() => setSelectedSpot(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            <Text style={[styles.emptyTitle, { color: text }]}>Здесь пока пусто</Text>
            <Text style={[styles.empty, { color: muted }]}>Найди новое место через «+» и сохрани его в СПОТ.</Text>
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
    paddingTop: 64,
    paddingHorizontal: 18
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1
  },
  count: {
    marginTop: 5,
    fontSize: 14
  },
  tabs: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 8
  },
  tab: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 18
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800'
  },
  list: {
    paddingTop: 20,
    paddingBottom: 130
  },
  emptyBlock: {
    paddingTop: 54,
    alignItems: 'center'
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '900'
  },
  empty: {
    marginTop: 7,
    maxWidth: 260,
    textAlign: 'center',
    lineHeight: 19
  }
});
