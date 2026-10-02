import type { Spot } from '../types';

const sourceNames: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  '2gis': '2ГИС',
  yandex_maps: 'Яндекс Карт',
  web: 'сайта'
};

function daysBetween(from: Date, to: Date) {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function dayWord(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}

export function savedContextLabel(
  spot: Pick<Spot, 'savedAt' | 'sourcePlatform'>,
  now = new Date()
) {
  let when = 'Сохранено в СПОТ';

  if (spot.savedAt) {
    const saved = new Date(spot.savedAt);
    if (!Number.isNaN(saved.getTime())) {
      const days = daysBetween(saved, now);
      if (days === 0) when = 'Сохранено сегодня';
      else if (days === 1) when = 'Сохранено вчера';
      else if (days < 60) when = `Сохранено ${days} ${dayWord(days)} назад`;
      else {
        when = `Сохранено ${saved.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: saved.getUTCFullYear() === now.getUTCFullYear() ? undefined : 'numeric'
        })}`;
      }
    }
  }

  const source = spot.sourcePlatform ? sourceNames[spot.sourcePlatform] : null;
  return source ? `${when} · из ${source}` : when;
}
