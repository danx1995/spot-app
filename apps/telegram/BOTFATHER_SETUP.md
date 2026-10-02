# СПОТ — запуск как Telegram Mini App

## 1. Создать бота

Откройте официальный @BotFather в Telegram:

1. Отправьте `/newbot`.
2. Укажите имя, например `СПОТ`.
3. Укажите username, который заканчивается на `bot`, например `spot_places_bot`.
4. BotFather выдаст bot token.

Bot token — серверный секрет. Не добавляйте его в React/Vite, GitHub или переменные `VITE_*`. Он должен храниться только в Railway/API как `TELEGRAM_BOT_TOKEN`.

## 2. Развернуть backend и Mini App

API:
- `DATABASE_URL`
- `AUTH_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `WEB_ALLOWED_ORIGINS=https://<mini-app-domain>`
- при необходимости `TWO_GIS_API_KEY`

Telegram frontend:
- build command: `npm run build`
- start command: `npm start`
- root: `/apps/telegram`
- `VITE_API_URL=https://<spot-api-domain>` должен присутствовать на этапе build.

Оба адреса должны быть HTTPS.

## 3. Подключить Mini App в BotFather

После получения production URL Mini App откройте @BotFather и настройте Web App для созданного бота.

Для постоянной кнопки в профиле/меню бота используйте настройку Menu Button и укажите HTTPS URL Mini App.

Для отдельного Direct Mini App можно создать Mini App через BotFather и назначить ему short name. Тогда Telegram сможет открывать СПОТ по прямой `t.me`-ссылке.

## 4. Проверить авторизацию

При запуске внутри Telegram браузер получает `Telegram.WebApp.initData`. Клиент отправляет raw строку в API, а API валидирует HMAC и срок данных. Только после успешной серверной проверки создаётся/открывается профиль СПОТ.

Не используйте `initDataUnsafe.user.id` как доверенный ID на сервере.

## 5. Что проверяем перед публичным запуском

- открытие из iPhone Telegram;
- открытие из Android Telegram;
- тёмная/светлая Telegram theme;
- safe area на iPhone с Dynamic Island;
- сохранение места и повторное открытие бота;
- облачная библиотека после перезапуска Telegram;
- импорт ссылки;
- публичные share-ссылки;
- маршруты;
- отсутствие доступа к API с незарегистрированного web-origin.
