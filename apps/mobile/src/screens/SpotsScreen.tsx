import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SpotCard } from '../components/SpotCard';
import { spots } from '../data/mock';
import { colors } from '../theme';
import type { SpotStatus } from '../types';

type Filter = 'all' | SpotStatus;

export function SpotsScreen() {
  const dark = useColorScheme() === 'dark';
  const [filter, setFilter] = useState<Filter>('all');
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const filtered = useMemo(() => filter === 'all' ? spots : spots.filter((s) => s.status === filter), [filter]);

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <Text style={[styles.title, { color: text }]}>Мои споты</Text>
      <Text style={[styles.count, { color: muted }]}>{spots.length} места · Санкт-Петербург</Text>

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
        renderItem={({ item }) => <SpotCard spot={item} compact />}
        ListEmptyComponent={<Text style={[styles.empty, { color: muted }]}>Здесь пока нет спотов.</Text>}
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
  empty: {
    marginTop: 36,
    textAlign: 'center'
  }
});
