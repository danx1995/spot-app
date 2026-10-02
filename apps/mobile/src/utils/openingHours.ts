import type { Spot, SpotDay, SpotOpeningHours, SpotTimeRange } from '../types';

export type SpotOpenState =
  | { kind: 'open'; label: string }
  | { kind: 'closed'; label: string }
  | { kind: 'unknown'; label: string };

const DAY_KEYS: SpotDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MOSCOW_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function placeTime(now: Date) {
  return new Date(now.getTime() + MOSCOW_UTC_OFFSET_MS);
}

function minutesOfDay(value: string | undefined) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && minutes === 0) return 24 * 60;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function intervalsFor(hours: SpotOpeningHours, day: SpotDay) {
  return hours.days?.[day] ?? [];
}

function isCrossMidnight(range: SpotTimeRange) {
  const from = minutesOfDay(range.from);
  const to = minutesOfDay(range.to);
  return from !== null && to !== null && from > to;
}

export function getSpotOpenState(
  spot: Pick<Spot, 'openingHours'>,
  now = new Date()
): SpotOpenState {
  const hours = spot.openingHours;
  if (!hours) {
    return { kind: 'unknown', label: 'Часы не указаны' };
  }
  if (hours.is24x7) {
    return { kind: 'open', label: 'Круглосуточно' };
  }

  const local = placeTime(now);
  const dayIndex = local.getUTCDay();
  const day = DAY_KEYS[dayIndex];
  const previousDay = DAY_KEYS[(dayIndex + 6) % 7];
  const currentMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();

  for (const range of intervalsFor(hours, previousDay)) {
    const to = minutesOfDay(range.to);
    if (isCrossMidnight(range) && to !== null && currentMinutes < to) {
      return { kind: 'open', label: `Открыто до ${range.to}` };
    }
  }

  for (const range of intervalsFor(hours, day)) {
    const from = minutesOfDay(range.from);
    const to = minutesOfDay(range.to);
    if (from === null || to === null) continue;

    if (from === to) {
      return { kind: 'open', label: 'Круглосуточно' };
    }
    if (from < to && currentMinutes >= from && currentMinutes < to) {
      return { kind: 'open', label: `Открыто до ${range.to}` };
    }
    if (from > to && currentMinutes >= from) {
      return { kind: 'open', label: `Открыто до ${range.to}` };
    }
  }

  for (const range of intervalsFor(hours, day)) {
    const from = minutesOfDay(range.from);
    if (from !== null && currentMinutes < from) {
      return { kind: 'closed', label: `Откроется в ${range.from}` };
    }
  }

  return { kind: 'closed', label: 'Сейчас закрыто' };
}

export function getTodayHoursLabel(
  spot: Pick<Spot, 'openingHours'>,
  now = new Date()
) {
  const hours = spot.openingHours;
  if (!hours) return null;
  if (hours.is24x7) return 'Круглосуточно';

  const local = placeTime(now);
  const day = DAY_KEYS[local.getUTCDay()];
  const ranges = intervalsFor(hours, day);

  if (ranges.length === 0) return 'Закрыто';

  return ranges
    .map((range) => {
      if (!range.from && !range.to) return 'Круглосуточно';
      return `${range.from || '00:00'}–${range.to || '24:00'}`;
    })
    .join(', ');
}
