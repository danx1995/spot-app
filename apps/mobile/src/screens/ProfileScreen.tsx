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

import { VisitHistoryModal } from '../components/VisitHistoryModal';
import {
  getAccountProfile,
  updateAccountProfile,
  type AccountProfile
} from '../services/accountApi';
import { useSpotStore, type SyncStatus } from '../state/SpotStore';
import { colors } from '../theme';

const syncCopy: Record<SyncStatus, string> = {
  idle: 'Готово к синхронизации',
  syncing: 'Синхронизируем…',
  synced: 'Синхронизировано',
  offline: 'Офлайн · данные сохранены на устройстве',
  conflict: 'Объединяем изменения…'
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'С';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function ProfileScreen() {
  const dark = useColorScheme() === 'dark';
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

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
  const raised = dark ? colors.darkSurfaceRaised : colors.lightMuted;

  useEffect(() => {
    let active = true;
    setProfileLoading(true);

    void getAccountProfile()
      .then((value) => {
        if (!active) return;
        setProfile(value);
        setDraftName(value.display_name ?? '');
        setProfileError(null);
      })
      .catch(() => {
        if (active) setProfileError('Профиль временно недоступен');
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

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
  const displayName = profile?.display_name?.trim() || 'Мой СПОТ';

  function openEditor() {
    setDraftName(profile?.display_name ?? '');
    setProfileError(null);
    setEditorOpen(true);
  }

  async function saveName() {
    if (savingName) return;
    setSavingName(true);
    setProfileError(null);

    try {
      const next = await updateAccountProfile({
        display_name: draftName.trim(),
        home_city: selectedCity
      });
      setProfile(next);
      setEditorOpen(false);
    } catch {
      setProfileError('Не удалось сохранить имя');
    } finally {
      setSavingName(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(displayName)}</Text>
          </View>

          <Pressable onPress={openEditor} style={styles.namePressable}>
            <Text style={[styles.name, { color: text }]}>{displayName}</Text>
            <Text style={[styles.editHint, { color: muted }]}>Нажми, чтобы изменить имя</Text>
          </Pressable>

          <View style={styles.profileMetaRow}>
            <Text style={[styles.city, { color: muted }]}>{city}</Text>
            <View style={[styles.dot, { backgroundColor: muted }]} />
            <Text style={[styles.accountState, { color: profile?.is_guest ? muted : colors.green }]}>
              {profileLoading
                ? 'Проверяем профиль…'
                : profile?.is_guest === false
                  ? 'Аккаунт подключён'
                  : 'Гостевой профиль'}
            </Text>
          </View>
        </View>

        <View style={[styles.stats, { backgroundColor: surface }]}>
          {stats.map(([value, label], index) => (
            <View key={label} style={[styles.stat, index > 0 && styles.statBorder]}>
              <Text style={[styles.statValue, { color: text }]}>{value}</Text>
              <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.accountCard, { backgroundColor: surface }]}>
          <View style={styles.accountIcon}>
            <Text style={styles.accountIconText}>{profile?.is_guest === false ? '✓' : '●'}</Text>
          </View>
          <View style={styles.accountCopy}>
            <Text style={[styles.accountTitle, { color: text }]}>
              {profile?.is_guest === false ? 'Профиль защищён аккаунтом' : 'Профиль уже хранится в облаке'}
            </Text>
            <Text style={[styles.accountSubtitle, { color: muted }]}>
              {profile?.is_guest === false
                ? 'Твои споты и подборки привязаны к постоянному аккаунту.'
                : 'Имя и библиотека сохраняются на сервере. Следующий шаг — подключение входа через Apple и Google без потери текущих данных.'}
            </Text>
            {profileError ? (
              <Text style={styles.profileError}>{profileError}</Text>
            ) : null}
          </View>
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
      </ScrollView>

      <VisitHistoryModal
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      <Modal
        visible={editorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditorOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: dark ? '#151B17' : colors.white }]}>
            <Text style={[styles.modalTitle, { color: text }]}>Имя в СПОТ</Text>
            <Text style={[styles.modalSubtitle, { color: muted }]}>
              Оно будет использоваться в профиле. Публично мы его нигде не показываем.
            </Text>

            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              maxLength={80}
              placeholder="Например: Даниил"
              placeholderTextColor={muted}
              style={[styles.nameInput, { color: text, backgroundColor: raised }]}
              returnKeyType="done"
              onSubmitEditing={() => void saveName()}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditorOpen(false)} style={styles.cancelButton}>
                <Text style={[styles.cancelText, { color: muted }]}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveName()}
                disabled={savingName}
                style={[styles.saveButton, savingName && styles.disabled]}
              >
                {savingName ? (
                  <ActivityIndicator color={colors.black} />
                ) : (
                  <Text style={styles.saveText}>Сохранить</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 120
  },
  profileHeader: {
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
    fontSize: 28,
    fontWeight: '900'
  },
  namePressable: {
    marginTop: 14,
    alignItems: 'center'
  },
  name: {
    fontSize: 28,
    fontWeight: '900'
  },
  editHint: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '700'
  },
  profileMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  city: {
    fontSize: 13
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.7
  },
  accountState: {
    fontSize: 11,
    fontWeight: '800'
  },
  stats: {
    width: '100%',
    marginTop: 25,
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
  accountCard: {
    width: '100%',
    marginTop: 14,
    borderRadius: 24,
    padding: 15,
    flexDirection: 'row',
    gap: 13
  },
  accountIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: '#173528',
    alignItems: 'center',
    justifyContent: 'center'
  },
  accountIconText: {
    color: colors.green,
    fontSize: 18,
    fontWeight: '900'
  },
  accountCopy: {
    flex: 1,
    paddingTop: 2
  },
  accountTitle: {
    fontSize: 14,
    fontWeight: '900'
  },
  accountSubtitle: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16
  },
  profileError: {
    marginTop: 6,
    color: colors.error,
    fontSize: 10,
    fontWeight: '800'
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
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end'
  },
  modalCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    paddingBottom: 38
  },
  modalTitle: {
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.7
  },
  modalSubtitle: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18
  },
  nameInput: {
    height: 58,
    marginTop: 18,
    borderRadius: 18,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '700'
  },
  modalActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10
  },
  cancelButton: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '800'
  },
  saveButton: {
    flex: 1.4,
    height: 54,
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
  disabled: {
    opacity: 0.55
  }
});
