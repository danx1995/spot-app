import React from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors } from '../theme';

const stats = [
  ['115', 'спотов'],
  ['34', 'посещено'],
  ['8', 'подборок']
];

export function ProfileScreen() {
  const dark = useColorScheme() === 'dark';
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <View style={styles.avatar}><Text style={styles.avatarText}>Д</Text></View>
      <Text style={[styles.name, { color: text }]}>Даниил</Text>
      <Text style={[styles.city, { color: muted }]}>Санкт-Петербург</Text>

      <View style={[styles.stats, { backgroundColor: surface }]}>
        {stats.map(([value, label], index) => (
          <View key={label} style={[styles.stat, index > 0 && styles.statBorder]}>
            <Text style={[styles.statValue, { color: text }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.menu, { backgroundColor: surface }]}>
        {['История посещений', 'Уведомления рядом', 'Тема приложения', 'Настройки', 'Помощь'].map((label) => (
          <View key={label} style={styles.menuRow}>
            <Text style={[styles.menuText, { color: text }]}>{label}</Text>
            <Text style={[styles.chevron, { color: muted }]}>›</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 70,
    paddingHorizontal: 20,
    alignItems: 'center'
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: colors.black,
    fontSize: 30,
    fontWeight: '900'
  },
  name: {
    marginTop: 16,
    fontSize: 28,
    fontWeight: '900'
  },
  city: {
    marginTop: 4,
    fontSize: 14
  },
  stats: {
    width: '100%',
    marginTop: 28,
    borderRadius: 24,
    paddingVertical: 18,
    flexDirection: 'row'
  },
  stat: {
    flex: 1,
    alignItems: 'center'
  },
  statBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#77807A55'
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900'
  },
  statLabel: {
    marginTop: 3,
    fontSize: 11
  },
  menu: {
    width: '100%',
    marginTop: 14,
    borderRadius: 24,
    paddingHorizontal: 17
  },
  menuRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#77807A33'
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700'
  },
  chevron: {
    fontSize: 24
  }
});
