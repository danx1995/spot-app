import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';
import MapView, { Marker, type MapPressEvent, type Region } from 'react-native-maps';

import { useSpotStore } from '../state/SpotStore';
import { colors } from '../theme';
import type { SpotCategory } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const CITY_REGIONS = {
  spb: {
    latitude: 59.9386,
    longitude: 30.3141,
    latitudeDelta: 0.085,
    longitudeDelta: 0.085
  },
  moscow: {
    latitude: 55.7558,
    longitude: 37.6173,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12
  }
} satisfies Record<'spb' | 'moscow', Region>;

const categoryOptions: Array<{ id: SpotCategory; label: string }> = [
  { id: 'restaurant', label: 'Еда' },
  { id: 'coffee', label: 'Кофе' },
  { id: 'bar', label: 'Бар' },
  { id: 'hotel', label: 'Отель' },
  { id: 'culture', label: 'Культура' },
  { id: 'park', label: 'Место' },
  { id: 'other', label: 'Другое' }
];

const categoryLabels: Record<SpotCategory, string> = {
  restaurant: 'Ресторан',
  coffee: 'Кофейня',
  bar: 'Бар',
  hotel: 'Отель',
  culture: 'Культура',
  entertainment: 'Развлечения',
  shop: 'Магазин',
  park: 'Место',
  other: 'Другое'
};

export function ManualPlaceModal({ visible, onClose }: Props) {
  const dark = useColorScheme() === 'dark';
  const { selectedCity, saveSpot } = useSpotStore();
  const initialPoint = useMemo(() => CITY_REGIONS[selectedCity], [selectedCity]);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<SpotCategory>('restaurant');
  const [point, setPoint] = useState({ latitude: initialPoint.latitude, longitude: initialPoint.longitude });

  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;
  const canSave = name.trim().length >= 2;

  function pickPoint(event: MapPressEvent) {
    setPoint(event.nativeEvent.coordinate);
  }

  function closeAndReset() {
    setName('');
    setAddress('');
    setCategory('restaurant');
    setPoint({ latitude: initialPoint.latitude, longitude: initialPoint.longitude });
    onClose();
  }

  function submit() {
    if (!canSave) return;

    const timestamp = Date.now();
    saveSpot({
      id: `manual_${timestamp.toString(36)}`,
      name: name.trim(),
      category,
      categoryLabel: categoryLabels[category],
      city: selectedCity,
      cityLabel: selectedCity === 'spb' ? 'Санкт-Петербург' : 'Москва',
      address: address.trim() || 'Точка на карте',
      latitude: point.latitude,
      longitude: point.longitude,
      distanceMeters: 0,
      rating: 0,
      status: 'want',
      note: 'Добавлено вручную'
    }, 'want');

    closeAndReset();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeAndReset}>
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.header}>
          <Pressable onPress={closeAndReset} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: text }]}>×</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Добавить вручную</Text>
          <Pressable
            onPress={submit}
            disabled={!canSave}
            style={[styles.saveHeader, !canSave && styles.disabled]}
          >
            <Text style={styles.saveHeaderText}>Готово</Text>
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={[styles.label, { color: muted }]}>НАЗВАНИЕ</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Название места"
            placeholderTextColor={muted}
            style={[styles.input, { color: text, backgroundColor: surface }]}
          />

          <Text style={[styles.label, { color: muted }]}>АДРЕС</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Можно оставить пустым"
            placeholderTextColor={muted}
            style={[styles.input, { color: text, backgroundColor: surface }]}
          />

          <Text style={[styles.label, { color: muted }]}>КАТЕГОРИЯ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
            {categoryOptions.map((item) => {
              const active = category === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setCategory(item.id)}
                  style={[styles.category, { backgroundColor: active ? colors.green : surface }]}
                >
                  <Text style={[styles.categoryText, { color: active ? colors.black : text }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.mapHeader}>
            <View style={styles.mapHeaderCopy}>
              <Text style={[styles.label, { color: muted }]}>ТОЧКА НА КАРТЕ</Text>
              <Text style={[styles.mapHint, { color: muted }]}>Нажми на карту, чтобы поставить точную метку.</Text>
            </View>
          </View>

          <View style={styles.mapShell}>
            <MapView
              key={selectedCity}
              style={StyleSheet.absoluteFill}
              initialRegion={initialPoint}
              onPress={pickPoint}
              showsPointsOfInterest={false}
              showsCompass={false}
            >
              <Marker coordinate={point}>
                <View style={styles.pin}><Text style={styles.pinHeart}>♥</Text></View>
              </Marker>
            </MapView>
          </View>

          <Pressable
            onPress={submit}
            disabled={!canSave}
            style={[styles.primaryButton, !canSave && styles.disabled]}
          >
            <Text style={styles.primaryText}>♥ Сохранить в СПОТ</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 66,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    fontSize: 30,
    lineHeight: 34
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900'
  },
  saveHeader: {
    minWidth: 70,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveHeaderText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '900'
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 44
  },
  label: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  input: {
    height: 56,
    borderRadius: 18,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '700'
  },
  categories: {
    gap: 8,
    paddingRight: 20
  },
  category: {
    height: 42,
    borderRadius: 17,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '800'
  },
  mapHeader: {
    marginTop: 8
  },
  mapHeaderCopy: {
    flex: 1
  },
  mapHint: {
    marginTop: -3,
    fontSize: 12,
    lineHeight: 17
  },
  mapShell: {
    height: 260,
    marginTop: 12,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#18201C'
  },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.black,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pinHeart: {
    color: colors.black,
    fontSize: 18,
    fontWeight: '900'
  },
  primaryButton: {
    minHeight: 58,
    marginTop: 18,
    borderRadius: 19,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryText: {
    color: colors.black,
    fontSize: 15,
    fontWeight: '900'
  },
  disabled: {
    opacity: 0.35
  }
});
