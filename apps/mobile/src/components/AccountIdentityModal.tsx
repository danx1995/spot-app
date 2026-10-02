import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { appConfig } from '../config';
import {
  getAccountProfile,
  getAuthProviders,
  linkProviderIdentity,
  loginWithProvider,
  ProviderIdentityInUseError,
  type AccountProfile,
  type AuthProvider
} from '../services/accountApi';
import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  profile: AccountProfile | null;
  visible: boolean;
  onClose: () => void;
  onProfile: (profile: AccountProfile) => void;
};

type ProviderAvailability = Record<AuthProvider, boolean>;

function randomNonce(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось подключить аккаунт';
}

function googleConfiguredForPlatform() {
  if (Platform.OS === 'ios') return Boolean(appConfig.googleAuth.iosClientId);
  if (Platform.OS === 'android') return Boolean(appConfig.googleAuth.androidClientId);
  if (Platform.OS === 'web') return Boolean(appConfig.googleAuth.webClientId);
  return false;
}

type GoogleButtonProps = {
  busy: boolean;
  onToken: (idToken: string) => void;
  onError: (message: string) => void;
};

function GoogleIdentityButton({ busy, onToken, onError }: GoogleButtonProps) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: appConfig.googleAuth.iosClientId,
    androidClientId: appConfig.googleAuth.androidClientId,
    webClientId: appConfig.googleAuth.webClientId,
    selectAccount: true,
    language: 'ru'
  });

  useEffect(() => {
    if (!response || response.type === 'cancel' || response.type === 'dismiss') return;

    if (response.type !== 'success') {
      onError('Google не завершил вход');
      return;
    }

    const idToken = response.params.id_token || response.authentication?.idToken;
    if (!idToken) {
      onError('Google не вернул токен подтверждения');
      return;
    }

    onToken(idToken);
  }, [onError, onToken, response]);

  return (
    <Pressable
      disabled={!request || busy}
      onPress={() => {
        void promptAsync().catch(() => {
          onError('Не удалось открыть вход через Google');
        });
      }}
      style={[styles.googleButton, (!request || busy) && styles.providerDisabled]}
    >
      <View style={styles.googleMark}>
        <Text style={styles.googleMarkText}>G</Text>
      </View>
      <Text style={styles.googleText}>Продолжить с Google</Text>
      {busy ? <ActivityIndicator color="#222222" size="small" /> : null}
    </Pressable>
  );
}

export function AccountIdentityModal({
  profile,
  visible,
  onClose,
  onProfile
}: Props) {
  const dark = useColorScheme() === 'dark';
  const { adoptSessionAndMerge, syncNow } = useSpotStore();
  const [availability, setAvailability] = useState<ProviderAvailability>({
    google: false,
    apple: false
  });
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busyProvider, setBusyProvider] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;
  const raised = dark ? colors.darkSurfaceRaised : colors.lightMuted;

  const googleReady = useMemo(
    () => availability.google && googleConfiguredForPlatform(),
    [availability.google]
  );
  const appleReady = Platform.OS === 'ios' && availability.apple && appleAvailable;

  useEffect(() => {
    if (!visible) return;

    let active = true;
    setError(null);
    setLoadingAvailability(true);

    void Promise.all([
      getAuthProviders(),
      Platform.OS === 'ios'
        ? AppleAuthentication.isAvailableAsync()
        : Promise.resolve(false)
    ])
      .then(([providers, appleSupported]) => {
        if (!active) return;
        setAvailability(providers);
        setAppleAvailable(appleSupported);
      })
      .catch(() => {
        if (!active) return;
        setError('Не удалось проверить способы входа');
      })
      .finally(() => {
        if (active) setLoadingAvailability(false);
      });

    return () => {
      active = false;
    };
  }, [visible]);

  async function mergeExistingAccount(
    provider: AuthProvider,
    idToken: string,
    nonce?: string
  ) {
    setBusyProvider(provider);
    setError(null);

    try {
      const session = await loginWithProvider(provider, idToken, nonce);
      await adoptSessionAndMerge(session);
      const nextProfile = await getAccountProfile();
      onProfile(nextProfile);
      onClose();
      Alert.alert(
        'Аккаунт подключён',
        'Споты и подборки с этого устройства объединены с существующим профилем СПОТ.'
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusyProvider(null);
    }
  }

  async function connectProvider(
    provider: AuthProvider,
    idToken: string,
    nonce?: string
  ) {
    setBusyProvider(provider);
    setError(null);

    try {
      await syncNow();
      const nextProfile = await linkProviderIdentity(provider, idToken, nonce);
      onProfile(nextProfile);
      onClose();
      Alert.alert(
        'Профиль защищён',
        provider === 'apple'
          ? 'Теперь этот СПОТ можно восстановить через Apple.'
          : 'Теперь этот СПОТ можно восстановить через Google.'
      );
    } catch (reason) {
      if (reason instanceof ProviderIdentityInUseError && profile?.is_guest !== false) {
        setBusyProvider(null);
        Alert.alert(
          'Этот аккаунт уже есть в СПОТ',
          'Можно войти в него и объединить с ним споты и подборки с этого устройства. Ничего из текущей библиотеки не удалится.',
          [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Объединить',
              onPress: () => {
                void mergeExistingAccount(provider, idToken, nonce);
              }
            }
          ]
        );
        return;
      }

      setError(errorMessage(reason));
    } finally {
      setBusyProvider((current) => current === provider ? null : current);
    }
  }

  async function connectApple() {
    if (!appleReady || busyProvider) return;

    setBusyProvider('apple');
    setError(null);

    try {
      const nonce = randomNonce(await Crypto.getRandomBytesAsync(16));
      const credential = await AppleAuthentication.signInAsync({
        nonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL
        ]
      });

      if (!credential.identityToken) {
        throw new Error('Apple не вернул токен подтверждения');
      }

      setBusyProvider(null);
      await connectProvider('apple', credential.identityToken, nonce);
    } catch (reason) {
      const code = typeof reason === 'object' && reason && 'code' in reason
        ? String((reason as { code?: unknown }).code ?? '')
        : '';

      if (code !== 'ERR_REQUEST_CANCELED') {
        setError(errorMessage(reason));
      }
      setBusyProvider(null);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={[styles.close, { backgroundColor: surface }]}>
            <Text style={[styles.closeText, { color: text }]}>×</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>АККАУНТ</Text>
            <Text style={[styles.title, { color: text }]}>
              {profile?.is_guest === false ? 'Способы входа' : 'Защитить свой СПОТ'}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          <View style={[styles.hero, { backgroundColor: surface }]}>
            <View style={styles.heroIcon}>
              <Text style={styles.heroIconText}>♥</Text>
            </View>
            <Text style={[styles.heroTitle, { color: text }]}>
              {profile?.is_guest === false
                ? 'Профиль уже защищён'
                : 'Споты останутся твоими'}
            </Text>
            <Text style={[styles.heroText, { color: muted }]}>
              {profile?.is_guest === false
                ? 'Можно добавить ещё один способ входа. Текущая библиотека останется в том же профиле.'
                : 'Подключи Apple или Google к текущему гостевому профилю. Создавать новую пустую карту не нужно.'}
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: muted }]}>СПОСОБ ВХОДА</Text>

          {loadingAvailability ? (
            <View style={[styles.loadingCard, { backgroundColor: surface }]}>
              <ActivityIndicator color={colors.green} />
              <Text style={[styles.loadingText, { color: muted }]}>Проверяем доступные способы…</Text>
            </View>
          ) : (
            <View style={styles.providers}>
              {googleReady ? (
                <GoogleIdentityButton
                  busy={busyProvider === 'google'}
                  onToken={(idToken) => void connectProvider('google', idToken)}
                  onError={setError}
                />
              ) : (
                <View style={[styles.unavailableProvider, { backgroundColor: raised }]}>
                  <View style={styles.unavailableMark}><Text style={styles.unavailableMarkText}>G</Text></View>
                  <View style={styles.unavailableCopy}>
                    <Text style={[styles.unavailableTitle, { color: text }]}>Google</Text>
                    <Text style={[styles.unavailableText, { color: muted }]}>
                      Недоступно в текущей сборке
                    </Text>
                  </View>
                </View>
              )}

              {Platform.OS === 'ios' ? (
                appleReady ? (
                  <View style={busyProvider === 'apple' ? styles.providerDisabled : undefined}>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={
                        dark
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={16}
                      style={styles.appleButton}
                      onPress={() => void connectApple()}
                    />
                  </View>
                ) : (
                  <View style={[styles.unavailableProvider, { backgroundColor: raised }]}>
                    <View style={styles.appleMark}><Text style={[styles.appleMarkText, { color: text }]}>●</Text></View>
                    <View style={styles.unavailableCopy}>
                      <Text style={[styles.unavailableTitle, { color: text }]}>Apple</Text>
                      <Text style={[styles.unavailableText, { color: muted }]}>
                        Недоступно в текущей сборке
                      </Text>
                    </View>
                  </View>
                )
              ) : null}
            </View>
          )}

          {error ? (
            <View style={[styles.errorCard, { backgroundColor: raised }]}>
              <Text style={styles.errorIcon}>!</Text>
              <Text style={[styles.errorText, { color: text }]}>{error}</Text>
            </View>
          ) : null}

          <View style={[styles.privacyCard, { backgroundColor: surface }]}>
            <Text style={[styles.privacyTitle, { color: text }]}>Что происходит с данными</Text>
            <Text style={[styles.privacyText, { color: muted }]}>
              СПОТ получает от провайдера подтверждённый идентификатор и, если доступно, email и имя. Пароль Apple или Google приложение не получает и не хранит.
            </Text>
          </View>

          <Text style={[styles.footerText, { color: muted }]}>
            Если аккаунт уже связан с другим профилем СПОТ, гостевую библиотеку можно объединить с ним после подтверждения.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 22
  },
  header: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center'
  },
  close: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    fontSize: 26,
    lineHeight: 30
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center'
  },
  eyebrow: {
    color: colors.green,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2
  },
  title: {
    marginTop: 3,
    fontSize: 18,
    fontWeight: '900'
  },
  headerSpacer: {
    width: 42
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 22
  },
  hero: {
    borderRadius: 25,
    padding: 22,
    alignItems: 'center'
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 21,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroIconText: {
    color: colors.black,
    fontSize: 26,
    fontWeight: '900'
  },
  heroTitle: {
    marginTop: 15,
    fontSize: 20,
    fontWeight: '900'
  },
  heroText: {
    marginTop: 6,
    maxWidth: 310,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 9,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.25
  },
  providers: {
    gap: 9
  },
  googleButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center'
  },
  googleMark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  googleMarkText: {
    color: '#4285F4',
    fontSize: 18,
    fontWeight: '900'
  },
  googleText: {
    flex: 1,
    marginLeft: 8,
    color: '#202124',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800'
  },
  appleButton: {
    width: '100%',
    height: 54
  },
  providerDisabled: {
    opacity: 0.5
  },
  unavailableProvider: {
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  unavailableMark: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  unavailableMarkText: {
    color: '#4285F4',
    fontSize: 16,
    fontWeight: '900'
  },
  appleMark: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  appleMarkText: {
    fontSize: 17
  },
  unavailableCopy: {
    flex: 1,
    marginLeft: 11
  },
  unavailableTitle: {
    fontSize: 12,
    fontWeight: '900'
  },
  unavailableText: {
    marginTop: 2,
    fontSize: 9
  },
  loadingCard: {
    minHeight: 70,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700'
  },
  errorCard: {
    marginTop: 12,
    borderRadius: 17,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  errorIcon: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '900'
  },
  errorText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700'
  },
  privacyCard: {
    marginTop: 15,
    borderRadius: 20,
    padding: 15
  },
  privacyTitle: {
    fontSize: 11,
    fontWeight: '900'
  },
  privacyText: {
    marginTop: 5,
    fontSize: 9,
    lineHeight: 15
  },
  footerText: {
    marginTop: 12,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 14
  }
});
