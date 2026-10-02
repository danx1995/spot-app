import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native';

import { colors } from '../theme';
import type { Spot } from '../types';
import { SpotCard } from './SpotCard';

type Props = {
  visible: boolean;
  spots: Spot[];
  radiusMeters: number;
  onClose: () => void;
  onSelect: (spot: Spot) => void;
};

function radiusLabel(radius: number) {
  if (radius < 1000) return `${radius} м`;
  return `${(radius / 1000).toFixed(radius % 1000 === 0 ? 0 : 1).replace('.', ',')} км`;
}

export function NearbySheet({ visible, spots, radiusMeters, onClose, onSelect }: Props) {
  const dark = useColorScheme() === 'dark';
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: text }]}>×</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: text }]}>Рядом сейчас</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              До {radiusLabel(radiusMeters)} · {spots.length} сохранено
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {spots.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyMark}><Text style={styles.emptyHeart}>♥</Text></View>
              <Text style={[styles.emptyTitle, { color: text }]}>Поблизости пока ничего</Text>
              <Text style={[styles.emptyText, { color: muted }]}>
                Сохраняй места заранее — СПОТ покажет их здесь, когда окажешься рядом.
              </Text>
            </View>
          ) : (
            spots.map((spot, index) => (
              <View key={spot.id} style={styles.cardWrap}>
                {index === 0 ? (
                  <View style={styles.closestBadge}>
                    <Text style={styles.closestText}>БЛИЖЕ ВСЕГО</Text>
                  </View>
                ) : null}
                <SpotCard
                  spot={spot}
                  compact
                  onPress={() => {
                    onSelect(spot);
                    onClose();
                  }}
                />
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  header: {
    minHeight: 76,
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
  headerCopy: {
    flex: 1,
    alignItems: 'center'
  },
  title: {
    fontSize: 18,
    fontWeight: '900'
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700'
  },
  headerSpacer: {
    width: 44
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 46
  },
  cardWrap: {
    marginTop: 12
  },
  closestBadge: {
    alignSelf: 'flex-start',
    marginBottom: 6,
    paddingHorizontal: 9,
    height: 25,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closestText: {
    color: colors.black,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  empty: {
    paddingTop: 90,
    paddingHorizontal: 28,
    alignItems: 'center'
  },
  emptyMark: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyHeart: {
    color: colors.black,
    fontSize: 27,
    fontWeight: '900'
  },
  emptyTitle: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: '900'
  },
  emptyText: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center'
  }
});
