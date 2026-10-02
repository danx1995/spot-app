import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';

import {
  createTransferCode,
  getAccountProfile,
  redeemTransferCode,
  type AccountProfile,
  type TransferCode
} from '../services/accountApi';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onTransferred: (profile: AccountProfile) => void;
};

type Mode = 'menu' | 'show' | 'enter';

export function ProfileTransferModal({ visible, onClose, onTransferred }: Props) {
  const dark = useColorScheme() === 'dark';
  const { syncNow, adoptSession } = useSpotStore();
  const [mode, setMode] = useState<Mode>('menu');
  const [generated, setGenerated] = useState<TransferCode | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const raised = dark ? colors.darkSurfaceRaised : colors.lightMuted;

  useEffect(() => {
    if (visible) return;
    setMode('menu');
    setGenerated(null);
    setInput('');
    setBusy(false);
    setError(null);
  }, [visible]);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      await syncNow();
      const value = await createTransferCode();
      setGenerated(value);
      setMode('show');
    } catch {
      setError('Не удалось создать код. Проверь подключение к интернету.');
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    const code = input.trim();
    if (!code || busy) return;

    setBusy(true);
    setError(null);

    try {
      const session = await redeemTransferCode(code);
      await adoptSession(session);
      const profile = await getAccountProfile();
      onTransferred(profile);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось открыть профиль по коду'
      );
    } finally {
      setBusy(false);
    }
  }

  async function shareCode() {
    if (!generated) return;
    await Share.share({
      title: 'Код переноса СПОТ',
      message: [
        'Код переноса профиля СПОТ:',
        generated.code,
        '',
        'Код одноразовый и действует 10 минут.'
      ].join('\n')
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: dark ? '#151B17' : colors.white }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: text }]}>Перенос профиля</Text>
              <Text style={[styles.subtitle, { color: muted }]}>
                Перенеси споты и подборки на другое устройство без регистрации.
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeText, { color: text }]}>×</Text>
            </Pressable>
          </View>

          {mode === 'menu' ? (
            <>
              <Pressable
                onPress={() => void generate()}
                disabled={busy}
                style={[styles.primaryCard, busy && styles.disabled]}
              >
                <View style={styles.optionIcon}><Text style={styles.optionIconText}>↗</Text></View>
                <View style={styles.optionCopy}>
                  <Text style={styles.primaryTitle}>Перенести отсюда</Text>
                  <Text style={styles.primaryText}>
                    Создать одноразовый код для другого телефона.
                  </Text>
                </View>
                {busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryArrow}>›</Text>}
              </Pressable>

              <Pressable
                onPress={() => {
                  setError(null);
                  setMode('enter');
                }}
                style={[styles.secondaryCard, { backgroundColor: raised }]}
              >
                <View style={styles.secondaryIcon}><Text style={styles.secondaryIconText}>↓</Text></View>
                <View style={styles.optionCopy}>
                  <Text style={[styles.secondaryTitle, { color: text }]}>Перенести сюда</Text>
                  <Text style={[styles.secondaryText, { color: muted }]}>
                    Ввести код, созданный на другом устройстве.
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: muted }]}>›</Text>
              </Pressable>
            </>
          ) : null}

          {mode === 'show' && generated ? (
            <>
              <View style={[styles.codeBox, { backgroundColor: raised }]}>
                <Text style={[styles.codeLabel, { color: muted }]}>ОДНОРАЗОВЫЙ КОД</Text>
                <Text selectable style={[styles.code, { color: text }]}>{generated.code}</Text>
                <Text style={[styles.codeExpiry, { color: muted }]}>
                  Действует до {new Date(generated.expires_at).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Text>
              </View>

              <Text style={[styles.warning, { color: muted }]}>
                Не публикуй этот код. Любой, у кого он есть, сможет один раз открыть твой профиль СПОТ.
              </Text>

              <Pressable onPress={() => void shareCode()} style={styles.shareButton}>
                <Text style={styles.shareButtonText}>↗ Отправить код</Text>
              </Pressable>

              <Pressable onPress={() => setMode('menu')} style={styles.backButton}>
                <Text style={[styles.backText, { color: muted }]}>Назад</Text>
              </Pressable>
            </>
          ) : null}

          {mode === 'enter' ? (
            <>
              <TextInput
                value={input}
                onChangeText={(value) => setInput(value.toUpperCase())}
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                placeholderTextColor={muted}
                style={[styles.input, { backgroundColor: raised, color: text }]}
                returnKeyType="done"
                onSubmitEditing={() => void redeem()}
              />

              <View style={[styles.notice, { backgroundColor: raised }]}>
                <Text style={[styles.noticeTitle, { color: text }]}>Что произойдёт</Text>
                <Text style={[styles.noticeText, { color: muted }]}>
                  СПОТ переключится на профиль с этого кода и загрузит его облачную библиотеку. Текущий профиль на сервере не удаляется.
                </Text>
              </View>

              <Pressable
                onPress={() => void redeem()}
                disabled={!input.trim() || busy}
                style={[
                  styles.redeemButton,
                  (!input.trim() || busy) && styles.disabled
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.black} />
                ) : (
                  <Text style={styles.redeemText}>Открыть профиль</Text>
                )}
              </Pressable>

              <Pressable onPress={() => setMode('menu')} style={styles.backButton}>
                <Text style={[styles.backText, { color: muted }]}>Назад</Text>
              </Pressable>
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end'
  },
  card: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    paddingBottom: 38
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
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.7
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    fontSize: 28,
    lineHeight: 31
  },
  primaryCard: {
    marginTop: 22,
    minHeight: 90,
    borderRadius: 22,
    padding: 15,
    backgroundColor: colors.green,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  secondaryCard: {
    marginTop: 10,
    minHeight: 84,
    borderRadius: 22,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: 'rgba(11,15,12,0.13)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  optionIconText: {
    color: colors.black,
    fontSize: 20,
    fontWeight: '900'
  },
  secondaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: '#173528',
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryIconText: {
    color: colors.green,
    fontSize: 20,
    fontWeight: '900'
  },
  optionCopy: {
    flex: 1
  },
  primaryTitle: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
  },
  primaryText: {
    marginTop: 4,
    color: '#0B0F0CAA',
    fontSize: 11,
    lineHeight: 16
  },
  primaryArrow: {
    color: colors.black,
    fontSize: 28
  },
  secondaryTitle: {
    fontSize: 14,
    fontWeight: '900'
  },
  secondaryText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16
  },
  chevron: {
    fontSize: 28
  },
  codeBox: {
    marginTop: 22,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center'
  },
  codeLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5
  },
  code: {
    marginTop: 10,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 1.5
  },
  codeExpiry: {
    marginTop: 9,
    fontSize: 11,
    fontWeight: '700'
  },
  warning: {
    marginTop: 12,
    paddingHorizontal: 4,
    fontSize: 11,
    lineHeight: 17
  },
  shareButton: {
    minHeight: 54,
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shareButtonText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
  },
  input: {
    height: 60,
    marginTop: 22,
    borderRadius: 18,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.7
  },
  notice: {
    marginTop: 12,
    borderRadius: 20,
    padding: 15
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '900'
  },
  noticeText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17
  },
  redeemButton: {
    height: 56,
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  redeemText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900'
  },
  backButton: {
    minHeight: 44,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  backText: {
    fontSize: 12,
    fontWeight: '800'
  },
  error: {
    marginTop: 10,
    color: colors.error,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'center'
  },
  disabled: {
    opacity: 0.45
  }
});
