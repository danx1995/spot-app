import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';

import { AccountIdentityModal } from '../components/AccountIdentityModal';
import { ProfileTransferModal } from '../components/ProfileTransferModal';
import { VisitHistoryModal } from '../components/VisitHistoryModal';
import {
  getAccountProfile,
  updateAccountProfile,
  type AccountProfile
} from '../services/accountApi';
import { useSpotStore, type SyncStatus } from '../state/SpotStore';
import { colors } from '../theme';
import type { DiscoveryInterest } from '../types';
import {
  clearDismissedRecommendations,
  getDismissedRecommendationIDs
} from '../utils/recommendationFeedback';
import {
  getThemePreference,
  setThemePreference,
  type ThemePreference
} from '../utils/themePreference';

const themeOptions: Array<{
  id: ThemePreference;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'system',
    label: 'Системная',
    description: 'Меняется вместе с настройками телефона',
    icon: '◐'
  },
  {
    id: 'light',
    label: 'Светлая',
    description: 'Всегда светлое оформление',
    icon: '○'
  },
  {
    id: 'dark',
    label: 'Тёмная',
    description: 'Всегда тёмное оформление',
    icon: '●'
  }
];

const interestOptions: Array<{ id: DiscoveryInterest; label: string; icon: string }> = [
  { id: 'restaurant', label: 'Еда', icon: '🍽' },
  { id: 'coffee', label: 'Кофе', icon: '☕' },
  { id: 'bar', label: 'Бары', icon: '◌' },
  { id: 'hotel', label: 'Отели', icon: 'H' },
  { id: 'culture', label: 'Культура', icon: '◇' }
];

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
  const [accountOpen, setAccountOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [themeSaving, setThemeSaving] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [dismissedRecommendationCount, setDismissedRecommendationCount] = useState(0);

  const {
    savedSpots,
    collections,
    selectedCity,
    interests,
    setInterests,
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

  useEffect(() => {
    let active = true;

    void getThemePreference().then((preference) => {
      if (active) setThemePreferenceState(preference);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getDismissedRecommendationIDs().then((ids) => {
      if (active) setDismissedRecommendationCount(ids.length);
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

  async function changeTheme(preference: ThemePreference) {
    if (themeSaving) return;

    setThemePreferenceState(preference);
    setThemeSaving(true);
    setProfileError(null);

    try {
      await setThemePreference(preference);
      setThemeOpen(false);

      const next = await updateAccountProfile({ theme: preference });
      setProfile(next);
    } catch {
      setProfileError('Тема применена на устройстве, но пока не синхронизировалась с профилем');
    } finally {
      setThemeSaving(false);
    }
  }

  function resetRecommendationFeedback() {
    if (dismissedRecommendationCount === 0) return;

    Alert.alert(
      'Показывать скрытые рекомендации снова?',
      'СПОТ забудет отметки «Не моё» на этом устройстве. Сохранённые места и интересы не изменятся.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          onPress: () => {
            void clearDismissedRecommendations().then(() => {
              setDismissedRecommendationCount(0);
            });
          }
        }
      ]
    );
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
                ? (profile.email
                    ? 'Профиль можно восстановить через подключённый вход · ' + profile.email
                    : 'Твои споты и подборки привязаны к постоянному аккаунту.')
                : 'Подключи Apple или Google к текущей карте — споты и подборки останутся на месте.'}
            </Text>
            {profileError ? (
              <Text style={styles.profileError}>{profileError}</Text>
            ) : null}
            <View style={styles.accountActions}>
              <Pressable onPress={() => setAccountOpen(true)} style={styles.accountButton}>
                <Text style={styles.accountButtonText}>
                  {profile?.is_guest === false ? 'Способы входа' : 'Защитить аккаунт'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTransferOpen(true)}
                style={[styles.transferButton, { backgroundColor: raised }]}
              >
                <Text style={[styles.transferButtonText, { color: text }]}>Перенести</Text>
              </Pressable>
            </View>
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

          <Pressable onPress={() => setInterestsOpen(true)} style={styles.menuRow}>
            <Text style={[styles.menuText, { color: text }]}>Интересы</Text>
            <Text style={[styles.menuValue, { color: muted }]}>
              {interests.length > 0 ? interests.length : 'Не выбраны'}
            </Text>
            <Text style={[styles.chevron, { color: muted }]}>›</Text>
          </Pressable>

          <Pressable
            onPress={resetRecommendationFeedback}
            disabled={dismissedRecommendationCount === 0}
            style={[styles.menuRow, dismissedRecommendationCount === 0 && styles.menuRowDisabled]}
          >
            <Text style={[styles.menuText, { color: text }]}>Скрытые рекомендации</Text>
            <Text style={[styles.menuValue, { color: muted }]}>
              {dismissedRecommendationCount > 0 ? dismissedRecommendationCount : 'Нет'}
            </Text>
            <Text style={[styles.chevron, { color: muted }]}>›</Text>
          </Pressable>

          <Pressable onPress={() => setThemeOpen(true)} style={styles.menuRow}>
            <Text style={[styles.menuText, { color: text }]}>Тема приложения</Text>
            <Text style={[styles.menuValue, { color: muted }]}>
              {themePreference === 'light'
                ? 'Светлая'
                : themePreference === 'dark'
                  ? 'Тёмная'
                  : 'Системная'}
            </Text>
            <Text style={[styles.chevron, { color: muted }]}>›</Text>
          </Pressable>

          {[
            ['Уведомления рядом', 'Скоро'],
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

      <AccountIdentityModal
        profile={profile}
        visible={accountOpen}
        onClose={() => setAccountOpen(false)}
        onProfile={(nextProfile) => {
          setProfile(nextProfile);
          setDraftName(nextProfile.display_name ?? '');
          setProfileError(null);

          const nextTheme = nextProfile.theme ?? themePreference;
          setThemePreferenceState(nextTheme);
          void setThemePreference(nextTheme);
        }}
      />

      <ProfileTransferModal
        visible={transferOpen}
        onClose={() => setTransferOpen(false)}
        onTransferred={(nextProfile) => {
          setProfile(nextProfile);
          setDraftName(nextProfile.display_name ?? '');
          setProfileError(null);
          const transferredTheme = nextProfile.theme ?? 'system';
          setThemePreferenceState(transferredTheme);
          void setThemePreference(transferredTheme);
        }}
      />

      <Modal
        visible={themeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setThemeOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: dark ? '#151B17' : colors.white }]}>
            <Text style={[styles.modalTitle, { color: text }]}>Тема приложения</Text>
            <Text style={[styles.modalSubtitle, { color: muted }]}>
              Выбор применяется сразу ко всему СПОТ, включая системные окна и навигацию.
            </Text>

            <View style={styles.themeList}>
              {themeOptions.map((item) => {
                const active = themePreference === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => void changeTheme(item.id)}
                    disabled={themeSaving}
                    style={[
                      styles.themeRow,
                      { backgroundColor: raised },
                      active && styles.themeRowActive,
                      themeSaving && styles.disabled
                    ]}
                  >
                    <View style={[styles.themeIcon, active && styles.themeIconActive]}>
                      <Text style={[styles.themeIconText, active && styles.themeIconTextActive]}>
                        {item.icon}
                      </Text>
                    </View>
                    <View style={styles.themeCopy}>
                      <Text style={[styles.themeLabel, { color: text }]}>{item.label}</Text>
                      <Text style={[styles.themeDescription, { color: muted }]}>
                        {item.description}
                      </Text>
                    </View>
                    <View style={[styles.interestCheck, active && styles.interestCheckActive]}>
                      <Text style={styles.interestCheckText}>{active ? '✓' : ''}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={() => setThemeOpen(false)} style={styles.themeClose}>
              <Text style={[styles.cancelText, { color: muted }]}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={interestsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInterestsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: dark ? '#151B17' : colors.white }]}>
            <Text style={[styles.modalTitle, { color: text }]}>Твои интересы</Text>
            <Text style={[styles.modalSubtitle, { color: muted }]}>
              Любимые категории будут идти первыми на карте. Можно выбрать несколько или оставить всё без приоритета.
            </Text>

            <View style={styles.interestList}>
              {interestOptions.map((item) => {
                const active = interests.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setInterests(
                        active
                          ? interests.filter((interest) => interest !== item.id)
                          : [...interests, item.id]
                      );
                    }}
                    style={[
                      styles.interestRow,
                      { backgroundColor: raised },
                      active && styles.interestRowActive
                    ]}
                  >
                    <View style={[styles.interestIcon, active && styles.interestIconActive]}>
                      <Text style={[styles.interestIconText, active && styles.interestIconTextActive]}>
                        {item.icon}
                      </Text>
                    </View>
                    <Text style={[styles.interestLabel, { color: text }]}>{item.label}</Text>
                    <View style={[styles.interestCheck, active && styles.interestCheckActive]}>
                      <Text style={styles.interestCheckText}>{active ? '✓' : ''}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={() => setInterestsOpen(false)} style={styles.interestDone}>
              <Text style={styles.interestDoneText}>Готово</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  accountActions: {
    marginTop: 11,
    flexDirection: 'row',
    gap: 8
  },
  accountButton: {
    flex: 1.35,
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  accountButtonText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: '900'
  },
  transferButton: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  transferButtonText: {
    fontSize: 11,
    fontWeight: '900'
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
  menuRowDisabled: {
    opacity: 0.55
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
  themeList: {
    marginTop: 18,
    gap: 8
  },
  themeRow: {
    minHeight: 68,
    borderRadius: 19,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent'
  },
  themeRowActive: {
    borderColor: '#19C37D66'
  },
  themeIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: '#202923',
    alignItems: 'center',
    justifyContent: 'center'
  },
  themeIconActive: {
    backgroundColor: colors.green
  },
  themeIconText: {
    color: '#AFB8B2',
    fontSize: 18,
    fontWeight: '900'
  },
  themeIconTextActive: {
    color: colors.black
  },
  themeCopy: {
    flex: 1,
    marginLeft: 12
  },
  themeLabel: {
    fontSize: 14,
    fontWeight: '900'
  },
  themeDescription: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14
  },
  themeClose: {
    minHeight: 48,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  interestList: {
    marginTop: 18,
    gap: 8
  },
  interestRow: {
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent'
  },
  interestRowActive: {
    borderColor: '#19C37D66'
  },
  interestIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#202923',
    alignItems: 'center',
    justifyContent: 'center'
  },
  interestIconActive: {
    backgroundColor: colors.green
  },
  interestIconText: {
    color: '#AFB8B2',
    fontSize: 15,
    fontWeight: '900'
  },
  interestIconTextActive: {
    color: colors.black
  },
  interestLabel: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '900'
  },
  interestCheck: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#5D6962',
    alignItems: 'center',
    justifyContent: 'center'
  },
  interestCheckActive: {
    backgroundColor: colors.green,
    borderColor: colors.green
  },
  interestCheckText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '900'
  },
  interestDone: {
    height: 54,
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  interestDoneText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
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
