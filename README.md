# СПОТ

Мобильное приложение — личная карта мест, куда хочется попасть.

Стартовый рынок: Москва и Санкт-Петербург.

## Продукт
СПОТ позволяет:
- сохранять рестораны, кофейни, бары, отели и другие места;
- видеть сохранённые места на карте;
- находить свои споты рядом;
- собирать коллекции;
- отмечать посещённые места;
- принимать ссылки через системное меню «Поделиться → СПОТ» на iOS и Android;
- сохранять источник места и дальше развивать автоматическое определение через resolver/AI.

## Структура
- apps/mobile — React Native / Expo приложение
- services/api — Go API
- database/migrations — PostgreSQL + PostGIS
- packages — общие пакеты
- infra — инфраструктура и deploy

## Бренд
Основной цвет: #19C37D  
Фон dark: #0B0F0C  
Светлый фон: #F5F7F6

Рабочий логотип: вариант 3 с зелёной геометкой и сердцем.

## Локальный запуск
1. Скопировать .env.example в .env
2. Запустить docker compose up -d
3. В apps/mobile выполнить npm install и npm start
4. В services/api выполнить go run ./cmd/api

## Share Extension / системное «Поделиться»
Для нативного приёма ссылок нужен development/production build — Expo Go не содержит нативный share-модуль.

1. `cd apps/mobile && npm install`
2. `npx expo prebuild --clean`
3. `npx expo run:ios` или `npx expo run:android`
4. В браузере, 2ГИС, Instagram, TikTok или Telegram открыть «Поделиться» → «СПОТ».

В Expo Go остальная часть приложения продолжает работать, share intent там автоматически отключён.
