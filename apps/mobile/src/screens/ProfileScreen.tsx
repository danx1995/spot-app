import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { VisitHistoryModal } from '../components/VisitHistoryModal';
import { useSpotStore, type SyncStatus } from '../state/SpotStore';
import { colors } from '../theme';

const syncCopy: Record<SyncStatus, string> = {
  idle: 'Готово к синхронизации',
  syncing: 'Синхронизируем…',
  synced: 'Синхронизировано',
  offline: 'Офлайн · данные сохранены на устройстве',
  conflict: 'Объединяем изменения…'
};

export function ProfileScreen() {
  const dark = useColorScheme() === 'dark';
  const [historyOpen, setHistoryOpen] = useState(false);
  const {
    savedSpots,
    collections,
    selectedCity,
    syncStatus,
    lastSyncedAt,
    syncNow
  } = useSpotStore();

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  const visited = useMemo(
    () => savedSpots.filter((spot) => spot.status === 'visited').length,
    [savedSpots]
  );

  const stats = [
    [String(savedSpots.length), 'спотов'],
    [String(visited), 'посещено'],
    [String(collections.length), 'подборок']
  ];

  const city = selectedCity === 'spb' ? 'Санкт-Петербург' : 'Москва';

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <View style={styles.avatar}><Text style={styles.avatarText}>С</Text></View>
      <Text style={[styles.name, { color: text }]}>Мой СПОТ</Text>
      <Text style={[styles.city, { color: muted }]}>{city}</Text>

      <View style={[styles.stats, { backgroundColor: surface }]}>
        {stats.map(([value, label], index) => (
          <View key={label} style={[styles.stat, index > 0 && styles.statBorder]}>
            <Text style={[styles.statValue, { color: text }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => void syncNow()}
        disabled={syncStatus === 'syncing'}
        style={[styles.syncCard, { backgroundColor: surface }]}
      >
        <View style={[styles.syncIcon, syncStatus === 'offline' && styles.syncIconOffline]}>
          <Text style={styles.syncIconText}>{syncStatus === 'synced' ? '✓' : '↻'}</Text>
        </View>
        <View style={styles.syncCopy}>
          <Text style={[styles.syncTitle, { color: text }]}>Облачная синхронизация</Text>
          <Text style={[styles.syncSubtitle, { color: muted }]}>{syncCopy[syncStatus]}</Text>
          {lastSyncedAt ? (
            <Text style={[styles.syncTime, { color: muted }]}>
              Последнее обновление: {new Date(lastSyncedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.chevron, { color: muted }]}>›</Text>
      </Pressable>

      <View style={[styles.menu, { backgroundColor: surface }]}>
        <Pressable onPress={() => setHistoryOpen(true)} style={styles.menuRow}>
          <Text style={[styles.menuText, { color: text }]}>История посещений</Text>
          <Text style={[styles.menuValue, { color: muted }]}>{visited}</Text>
          <Text style={[styles.chevron, { color: muted }]}>›</Text>
        </Pressable>

        {[
          ['Уведомления рядом', 'Скоро'],
          ['Тема приложения', 'Системная'],
          ['Настройки', 'Скоро'],
          ['Помощь', 'Скоро']
        ].map(([label, value]) => (
          <View key={label} style={styles.menuRow}>
            <Text style={[styles.menuText, { color: text }]}>{label}</Text>
            <Text style={[styles.menuValue, { color: muted }]}>{value}</Text>
          </View>
        ))}
      </View>

      <VisitHistoryModal
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
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
  syncCard: {
    width: '100%',
    minHeight: 82,
    marginTop: 14,
    borderRadius: 24,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  syncIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  syncIconOffline: {
    backgroundColor: '#3B443F'
  },
  syncIconText: {
    color: colors.black,
    fontSize: 21,
    fontWeight: '900'
  },
  syncCopy: {
    flex: 1,
    marginLeft: 13
  },
  syncTitle: {
    fontSize: 14,
    fontWeight: '900'
  },
  syncSubtitle: {
    marginTop: 3,
    fontSize: 12
  },
  syncTime: {
    marginTop: 3,
    fontSize: 10
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
  menuValue: {
    marginLeft: 12,
    fontSize: 12,
    fontWeight: '700'
  },
  chevron: {
    marginLeft: 6,
    fontSize: 24
  }
});
