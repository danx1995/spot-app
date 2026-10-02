# СПОТ — Development Builds

СПОТ использует Expo SDK 54 и `expo-dev-client`. Development build нужен для нативных возможностей, которые нельзя полноценно проверить в web-preview или Expo Go: Sign in with Apple, Share → СПОТ, deep links, геолокация и нативные разрешения.

## Один раз: Expo / EAS

Из `apps/mobile`:

```bash
npx eas-cli login
npx eas-cli init
```

После `eas init` Expo добавит project ID проекта в app config. Не создавайте второй Expo project для СПОТ, если он уже был создан ранее.

## iPhone — реальное устройство

Требуется Apple Developer account. Для iOS 16+ после первой установки development build включите Developer Mode на iPhone.

Зарегистрировать iPhone для internal distribution:

```bash
npx eas-cli device:create
```

Откройте появившуюся ссылку именно на iPhone и завершите регистрацию устройства.

Собрать development build:

```bash
npm run build:dev:ios
```

или из корня репозитория:

```bash
npm run build:dev:ios
```

После сборки EAS покажет install URL/QR. Откройте его на iPhone и установите СПОТ.

Если позже добавится новый iPhone, его нужно добавить в provisioning profile и пересобрать либо re-sign существующий IPA.

## Android — Windows + Android Studio Emulator

1. Установите Android Studio.
2. Откройте Device Manager.
3. Создайте Pixel 9 или аналогичный современный Pixel.
4. Запустите эмулятор.
5. Соберите APK:

```bash
npm run build:dev:android
```

После завершения можно скачать APK и перетащить его мышью в окно Android Emulator.

Один и тот же internal-development APK подходит и для Android Emulator, и для реального Android-устройства.

## Ежедневная разработка после установки development build

Запустить Metro из корня репозитория:

```bash
npm run mobile:dev-client
```

Development client будет пытаться открыть последний Metro project автоматически.

Телефон и компьютер могут быть в одной локальной сети. Если LAN недоступен, используйте Expo tunnel:

```bash
cd apps/mobile
npx expo start --dev-client --tunnel
```

Нативные изменения (новый Expo plugin, permission, Apple capability, изменение package/bundle identifier) требуют новой development build. Обычные JS/TS/UI-правки — нет: достаточно перезапустить Metro/обновить приложение.

## Build profiles

- `development` — dev client + internal distribution; Android выдаёт APK, iOS — IPA для зарегистрированного устройства.
- `preview` — production-like internal build без dev tools.
- `production` — store build.

Можно собрать обе development-версии одним EAS Workflow:

```bash
cd apps/mobile
npx eas-cli workflow:run .eas/workflows/create-development-builds.yml
```

## Backend

Для development build на физическом iPhone `http://localhost:8080` не подходит: localhost внутри приложения — это сам iPhone. Укажите публичный HTTPS API через EAS environment variable:

```
EXPO_PUBLIC_API_URL=https://<spot-api-domain>
EXPO_PUBLIC_SHARE_URL=https://<spot-api-domain>
```

Google OAuth client IDs также задаются как EAS public environment variables:

```
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

Секреты провайдеров и `AUTH_SECRET` никогда не добавляются в EXPO_PUBLIC_*.
