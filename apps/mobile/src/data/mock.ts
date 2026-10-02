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
    distanceMeters: 710,
    rating: 4.7,
    priceLevel: 2,
    status: 'want'
  },
  {
    id: 'wawelberg-spb',
    name: 'Wawelberg Hotel',
    category: 'hotel',
    categoryLabel: 'Отель',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    address: 'Невский проспект, 7–9',
    distanceMeters: 1200,
    rating: 4.9,
    status: 'booked'
  },
  {
    id: 'new-holland-spb',
    name: 'Новая Голландия',
    category: 'park',
    categoryLabel: 'Место',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    address: 'наб. Адмиралтейского канала, 2',
    distanceMeters: 1800,
    rating: 4.9,
    status: 'visited'
  }
];

export const collections: Collection[] = [
  { id: 'date', title: 'Свидания', subtitle: 'Красиво и вкусно', count: 18, cityLabel: 'Санкт-Петербург' },
  { id: 'breakfast', title: 'Завтраки', subtitle: 'Начать день', count: 12, cityLabel: 'Санкт-Петербург' },
  { id: 'weekend', title: 'Москва на выходные', subtitle: 'Следующая поездка', count: 16, cityLabel: 'Москва' },
  { id: 'hotels', title: 'Отели', subtitle: 'Где остановиться', count: 7, cityLabel: 'Москва · Петербург' }
];

export const categories = [
  { id: 'all', label: 'Все' },
  { id: 'restaurant', label: 'Еда' },
  { id: 'coffee', label: 'Кофе' },
  { id: 'bar', label: 'Бары' },
  { id: 'hotel', label: 'Отели' },
  { id: 'culture', label: 'Культура' }
] as const;
