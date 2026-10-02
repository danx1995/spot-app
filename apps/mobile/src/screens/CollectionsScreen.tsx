import React from 'react';
import { FlatList, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { collections } from '../data/mock';
import { colors } from '../theme';

export function CollectionsScreen() {
  const dark = useColorScheme() === 'dark';
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <Text style={[styles.title, { color: text }]}>Подборки</Text>
      <Text style={[styles.subtitle, { color: muted }]}>Собирай свои места по поездкам и настроению.</Text>

      <FlatList
        data={collections}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={[styles.card, { backgroundColor: surface }]}>
            <View style={[styles.cover, index === 0 && styles.coverFeatured]}>
              <Text style={styles.coverHeart}>{index === 0 ? '♥' : '●'}</Text>
            </View>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: text }]}>{item.title}</Text>
            <Text style={[styles.cardMeta, { color: muted }]}>{item.count} мест</Text>
            <Text numberOfLines={1} style={[styles.cardCity, { color: muted }]}>{item.cityLabel}</Text>
          </View>
        )}
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
  subtitle: {
    marginTop: 7,
    fontSize: 14
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
  }
});
