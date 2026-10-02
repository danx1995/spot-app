import type { CollectionRoutePlan } from '../types';

const MOSCOW_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function moscowClockTarget(
  now: Date,
  hour: number,
  minute: number,
  addDays: number,
  rollForward: boolean
) {
  const local = new Date(now.getTime() + MOSCOW_UTC_OFFSET_MS);
  let utcMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + addDays,
    hour,
    minute
  ) - MOSCOW_UTC_OFFSET_MS;

  if (rollForward && utcMs <= now.getTime()) {
    utcMs += 24 * 60 * 60 * 1000;
  }
  return new Date(utcMs);
}

export function resolveCollectionRouteStartAt(
  preset: CollectionRoutePlan['startPreset'],
  now = new Date()
) {
  if (preset === 'evening') {
    return moscowClockTarget(now, 19, 0, 0, true).toISOString();
  }
  if (preset === 'tomorrow') {
    return moscowClockTarget(now, 12, 0, 1, false).toISOString();
  }
  return now.toISOString();
}

function fallbackPresetLabel(plan: CollectionRoutePlan) {
  if (plan.startPreset === 'now') return 'Сейчас';
  if (plan.startPreset === 'evening') return 'Вечером · 19:00';
  return 'Завтра · 12:00';
}

function localDateSerial(value: Date) {
  const local = new Date(value.getTime() + MOSCOW_UTC_OFFSET_MS);
  return Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate()
  );
}

export function formatCollectionRouteStart(
  plan: CollectionRoutePlan,
  now = new Date()
) {
  if (!plan.startAt) return fallbackPresetLabel(plan);

  const start = new Date(plan.startAt);
  if (Number.isNaN(start.getTime())) return fallbackPresetLabel(plan);

  const local = new Date(start.getTime() + MOSCOW_UTC_OFFSET_MS);
  const hours = String(local.getUTCHours()).padStart(2, '0');
  const minutes = String(local.getUTCMinutes()).padStart(2, '0');
  const time = hours + ':' + minutes;

  const dayDiff = Math.round(
    (localDateSerial(start) - localDateSerial(now)) / (24 * 60 * 60 * 1000)
  );

  if (dayDiff === 0) return 'Сегодня · ' + time;
  if (dayDiff === 1) return 'Завтра · ' + time;

  const day = String(local.getUTCDate()).padStart(2, '0');
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  return day + '.' + month + ' · ' + time;
}
