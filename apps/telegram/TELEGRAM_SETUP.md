# СПОТ как Telegram Mini App

Telegram-версия СПОТ не требует App Store, Apple Developer Program или установки отдельного приложения. Пользователь открывает СПОТ прямо внутри Telegram на iPhone, Android, macOS, Windows или Web.

## 1. Создать бота

Откройте официальный **@BotFather** и создайте бота:

1. /newbot
2. Имя: например **СПОТ**
3. Username: например **spot_places_bot** — должен оканчиваться на bot.
4. BotFather выдаст bot token.

**Bot token — секрет. Не добавляйте его в GitHub и не вставляйте в клиентский JavaScript.**

На сервере он задаётся как TELEGRAM_BOT_TOKEN.

## 2. Развернуть два HTTPS-сервиса

### spot-api

Root directory: /services/api

Переменные:

- DATABASE_URL — Postgres connection string
- AUTH_SECRET — strong random secret
- TELEGRAM_BOT_TOKEN — token from BotFather
- CORS_ALLOWED_ORIGINS — HTTPS origin Telegram Mini App
- TWO_GIS_API_KEY — optional, но рекомендуется для реального поиска мест

Healthcheck: /health

### spot-telegram

Root directory: /apps/telegram

Start command: npm start

Healthcheck: /healthz

Переменные:

- SPOT_API_URL — публичный HTTPS URL spot-api
- SPOT_BOT_USERNAME — username бота без @
- SPOT_ALLOW_BROWSER_GUEST=false

## 3. Настроить Main Mini App в BotFather

После получения публичного HTTPS URL Telegram-клиента:

1. Откройте @BotFather.
2. Выберите своего бота через /mybots.
3. Откройте настройки Mini App / **Main Mini App**.
4. Укажите URL сервиса spot-telegram.
5. При необходимости задайте кнопку меню через /setmenubutton или **Bot Settings → Menu Button** с тем же URL.

После настройки пользователь сможет открывать СПОТ с профиля бота кнопкой **Launch app**.

Прямая ссылка основного Mini App имеет вид:

https://t.me/<botusername>?startapp

## 4. Как работает вход

Telegram передаёт Mini App поле Telegram.WebApp.initData.

Клиент отправляет **raw initData** в POST /api/v1/auth/telegram.

API:

- проверяет HMAC-SHA-256 подпись через bot token;
- проверяет auth_date, принимая только свежие данные;
- извлекает Telegram user ID;
- находит существующий профиль или создаёт его при первом запуске;
- выдаёт обычный SPOT bearer token;
- сохраняет имя и аватар Telegram в профиле, если они ещё пустые.

initDataUnsafe не используется как доверенный источник авторизации.

## 5. Что уже перенесено

Telegram Mini App уже содержит:

- onboarding;
- Санкт-Петербург / Москва;
- интерактивную карту;
- поиск мест;
- категории;
- «Для тебя»;
- сохранение спотов;
- статусы «Хочу / Бронь / Был»;
- импорт ссылок;
- подборки;
- профиль;
- интересы;
- облачную синхронизацию;
- Telegram theme/safe-area;
- Telegram BackButton и haptic feedback.

Нативный iOS/Android клиент можно оставить в репозитории как отдельный клиент, но для основной Telegram-версии он не требуется.

## 6. Локальная проверка вне Telegram

Для браузерной разработки можно временно запустить apps/telegram с:

SPOT_ALLOW_BROWSER_GUEST=true
SPOT_API_URL=http://localhost:8080

В production SPOT_ALLOW_BROWSER_GUEST должен оставаться false, чтобы вход происходил только через проверенный Telegram initData.
