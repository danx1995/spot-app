import type { Collection, Spot } from '../types';

export const spots: Spot[] = [
  {
    id: 'birch-spb',
    name: 'Birch',
    category: 'restaurant',
    categoryLabel: 'Ресторан',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    address: 'Кирочная улица, 3',
    latitude: 59.9449,
    longitude: 30.3596,
    distanceMeters: 420,
    rating: 4.8,
    priceLevel: 3,
    status: 'want',
    favorite: true,
    note: 'Сохранено для особенного ужина.'
  },
  {
    id: 'skuratov-spb',
    name: 'Skuratov Coffee',
    category: 'coffee',
    categoryLabel: 'Кофейня',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    address: 'Невский проспект',
    latitude: 59.9343,
    longitude: 30.3351,
    distanceMeters: 710,
    rating: 4.7,
    priceLevel: 2,
    status: 'want',
    note: 'Хочу попробовать фильтр и завтрак.'
  },
  {
    id: 'wawelberg-spb',
    name: 'Wawelberg Hotel',
    category: 'hotel',
    categoryLabel: 'Отель',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    address: 'Невский проспект, 7–9',
    latitude: 59.9361,
    longitude: 30.3154,
    distanceMeters: 1200,
    rating: 4.9,
    status: 'booked',
    note: 'Посмотреть как вариант на выходные.'
  },
  {
    id: 'new-holland-spb',
    name: 'Новая Голландия',
    category: 'park',
    categoryLabel: 'Место',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    address: 'наб. Адмиралтейского канала, 2',
    latitude: 59.9297,
    longitude: 30.2895,
    distanceMeters: 1800,
    rating: 4.9,
    status: 'visited'
  }
];

export const collections: Collection[] = [
  {
    id: 'date',
    title: 'Свидания',
    subtitle: 'Красиво и вкусно',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    placeIds: ['birch-spb', 'new-holland-spb'],
    createdAt: '2026-10-02T00:00:00.000Z'
  },
  {
    id: 'breakfast',
    title: 'Завтраки',
    subtitle: 'Начать день',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    placeIds: ['skuratov-spb'],
    createdAt: '2026-10-02T00:00:00.000Z'
  },
  {
    id: 'hotels',
    title: 'Отели',
    subtitle: 'Где остановиться',
    city: 'both',
    cityLabel: 'Москва · Петербург',
    placeIds: ['wawelberg-spb'],
    createdAt: '2026-10-02T00:00:00.000Z'
  }
];

export const categories = [
  { id: 'all', label: 'Все' },
  { id: 'restaurant', label: 'Еда' },
  { id: 'coffee', label: 'Кофе' },
  { id: 'bar', label: 'Бары' },
  { id: 'hotel', label: 'Отели' },
  { id: 'culture', label: 'Культура' }
] as const;
