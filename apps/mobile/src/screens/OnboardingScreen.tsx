import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '../components/BrandMark';
import { colors } from '../theme';
import type { DiscoveryInterest } from '../types';

type OnboardingCity = 'spb' | 'moscow' | 'both';
type OnboardingStep = 'intro' | 'interests' | 'city';

type Props = {
  onComplete: (city: OnboardingCity, interests: DiscoveryInterest[]) => void;
};

const interestOptions: Array<{
  id: DiscoveryInterest;
  label: string;
  icon: string;
  subtitle: string;
}> = [
  { id: 'restaurant', label: 'Еда', icon: '🍽', subtitle: 'Рестораны и гастрономия' },
  { id: 'coffee', label: 'Кофе', icon: '☕', subtitle: 'Кофейни и завтраки' },
  { id: 'bar', label: 'Бары', icon: '◌', subtitle: 'Коктейли и вечер' },
  { id: 'hotel', label: 'Отели', icon: 'H', subtitle: 'Где остановиться' },
  { id: 'culture', label: 'Культура', icon: '◇', subtitle: 'Музеи и выставки' }
];

export function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState<OnboardingStep>('intro');
  const [city, setCity] = useState<OnboardingCity>('spb');
  const [interests, setInterests] = useState<DiscoveryInterest[]>([]);

  function toggleInterest(interest: DiscoveryInterest) {
    setInterests((current) => (
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest]
    ));
  }

  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <BrandMark size={54} inverted />
        <View style={styles.progress}>
          {(['intro', 'interests', 'city'] as OnboardingStep[]).map((item) => (
            <View
              key={item}
              style={[
                styles.progressDot,
                item === step && styles.progressDotActive
              ]}
            />
          ))}
        </View>
      </View>

      {step === 'intro' ? (
        <>
          <View style={styles.hero}>
            <View style={styles.heroPin}>
              <Text style={styles.heroHeart}>♥</Text>
            </View>
            <View style={[styles.orbit, styles.orbitOne]} />
            <View style={[styles.orbit, styles.orbitTwo]} />
          </View>

          <View style={styles.copy}>
            <Text style={styles.kicker}>ТВОЯ ЛИЧНАЯ КАРТА</Text>
            <Text style={styles.title}>Все места, куда хочется попасть.</Text>
            <Text style={styles.subtitle}>
              Сохраняй места из Reels, TikTok, Telegram и карт. СПОТ запомнит, где они и почему ты их сохранил.
            </Text>
          </View>

          <View style={styles.bottom}>
            <Pressable onPress={() => setStep('interests')} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Продолжить</Text>
            </Pressable>
            <Text style={styles.privacy}>
              Без публичной геолокации. Твои сохранённые места приватны по умолчанию.
            </Text>
          </View>
        </>
      ) : null}

      {step === 'interests' ? (
        <>
          <View style={styles.stepCopy}>
            <Text style={styles.kicker}>НАСТРОИМ КАРТУ</Text>
            <Text style={styles.stepTitle}>Что тебе интересно?</Text>
            <Text style={styles.subtitle}>
              Поднимем любимые категории выше. Это можно будет изменить позже.
            </Text>
          </View>

          <View style={styles.interestGrid}>
            {interestOptions.map((item) => {
              const active = interests.includes(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggleInterest(item.id)}
                  style={[styles.interestCard, active && styles.interestCardActive]}
                >
                  <View style={[styles.interestIcon, active && styles.interestIconActive]}>
                    <Text style={[styles.interestIconText, active && styles.interestIconTextActive]}>
                      {item.icon}
                    </Text>
                  </View>
                  <View style={styles.interestCopy}>
                    <Text style={[styles.interestTitle, active && styles.interestTitleActive]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.interestSubtitle, active && styles.interestSubtitleActive]}>
                      {item.subtitle}
                    </Text>
                  </View>
                  <View style={[styles.check, active && styles.checkActive]}>
                    <Text style={styles.checkText}>{active ? '✓' : ''}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.bottom}>
            <Pressable onPress={() => setStep('city')} style={styles.primaryButton}>
              <Text style={styles.primaryText}>
                {interests.length > 0 ? 'Продолжить · ' + interests.length : 'Пропустить'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setStep('intro')} style={styles.backButton}>
              <Text style={styles.backText}>Назад</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {step === 'city' ? (
        <>
          <View style={styles.stepCopy}>
            <Text style={styles.kicker}>СТАРТОВЫЕ ГОРОДА</Text>
            <Text style={styles.stepTitle}>Где искать споты?</Text>
            <Text style={styles.subtitle}>
              На старте доступны Москва и Санкт-Петербург. Между ними можно переключаться в один тап.
            </Text>
          </View>

          <View style={styles.cityList}>
            {([
              ['spb', 'Санкт-Петербург', 'СПБ', '59.93° · 30.31°'],
              ['moscow', 'Москва', 'МСК', '55.75° · 37.61°'],
              ['both', 'Оба города', '2', 'Москва + Петербург']
            ] as const).map(([id, label, short, meta]) => {
              const active = city === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setCity(id)}
                  style={[styles.cityCard, active && styles.cityCardActive]}
                >
                  <View style={[styles.cityBadge, active && styles.cityBadgeActive]}>
                    <Text style={[styles.cityBadgeText, active && styles.cityBadgeTextActive]}>{short}</Text>
                  </View>
                  <View style={styles.cityCopy}>
                    <Text style={[styles.cityTitle, active && styles.cityTitleActive]}>{label}</Text>
                    <Text style={[styles.cityMeta, active && styles.cityMetaActive]}>{meta}</Text>
                  </View>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioCore} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.locationNote, { marginTop: 16 }]}>
            <Text style={styles.locationNoteIcon}>⌖</Text>
            <Text style={styles.locationNoteText}>
              Геолокацию не просим сейчас. Она включится только когда ты сам откроешь «рядом».
            </Text>
          </View>

          <View style={styles.bottom}>
            <Pressable onPress={() => onComplete(city, interests)} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Открыть СПОТ</Text>
            </Pressable>
            <Pressable onPress={() => setStep('interests')} style={styles.backButton}>
              <Text style={styles.backText}>Назад</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
    paddingTop: 62,
    paddingHorizontal: 22,
    paddingBottom: 30
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  progress: {
    flexDirection: 'row',
    gap: 6
  },
  progressDot: {
    width: 18,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#26302A'
  },
  progressDotActive: {
    width: 34,
    backgroundColor: colors.green
  },
  hero: {
    height: 245,
    marginTop: 54,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroPin: {
    zIndex: 3,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOpacity: 0.24,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 10 }
  },
  heroHeart: {
    color: colors.black,
    fontSize: 48,
    fontWeight: '900'
  },
  orbit: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#214434',
    borderRadius: 999
  },
  orbitOne: {
    width: 185,
    height: 185
  },
  orbitTwo: {
    width: 240,
    height: 240,
    opacity: 0.5
  },
  copy: {
    marginTop: 22
  },
  stepCopy: {
    marginTop: 58
  },
  kicker: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.9
  },
  title: {
    color: colors.white,
    marginTop: 9,
    fontSize: 39,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -1.7
  },
  stepTitle: {
    color: colors.white,
    marginTop: 9,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1.2
  },
  subtitle: {
    color: '#99A49E',
    marginTop: 13,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 355
  },
  interestGrid: {
    marginTop: 24,
    gap: 9
  },
  interestCard: {
    minHeight: 72,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#202823',
    backgroundColor: '#131915',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center'
  },
  interestCardActive: {
    borderColor: '#19C37D77',
    backgroundColor: '#14271E'
  },
  interestIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#1B231E',
    alignItems: 'center',
    justifyContent: 'center'
  },
  interestIconActive: {
    backgroundColor: colors.green
  },
  interestIconText: {
    color: '#B9C1BC',
    fontSize: 18,
    fontWeight: '900'
  },
  interestIconTextActive: {
    color: colors.black
  },
  interestCopy: {
    flex: 1,
    marginLeft: 12
  },
  interestTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900'
  },
  interestTitleActive: {
    color: colors.white
  },
  interestSubtitle: {
    color: '#77837C',
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14
  },
  interestSubtitleActive: {
    color: '#9CB5A8'
  },
  check: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#39433D',
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkActive: {
    borderColor: colors.green,
    backgroundColor: colors.green
  },
  checkText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '900'
  },
  cityList: {
    marginTop: 28,
    gap: 10
  },
  cityCard: {
    minHeight: 82,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#202823',
    backgroundColor: '#131915',
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center'
  },
  cityCardActive: {
    borderColor: '#19C37D77',
    backgroundColor: '#14271E'
  },
  cityBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#1B231E',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cityBadgeActive: {
    backgroundColor: colors.green
  },
  cityBadgeText: {
    color: '#A7B0AB',
    fontSize: 12,
    fontWeight: '900'
  },
  cityBadgeTextActive: {
    color: colors.black
  },
  cityCopy: {
    flex: 1,
    marginLeft: 13
  },
  cityTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900'
  },
  cityTitleActive: {
    color: colors.white
  },
  cityMeta: {
    color: '#758078',
    marginTop: 4,
    fontSize: 10
  },
  cityMetaActive: {
    color: '#9CB5A8'
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A443E',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioActive: {
    borderColor: colors.green
  },
  radioCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green
  },
  locationNote: {
    borderRadius: 18,
    backgroundColor: '#101612',
    padding: 14,
    flexDirection: 'row',
    gap: 10
  },
  locationNoteIcon: {
    color: colors.green,
    fontSize: 18,
    fontWeight: '900'
  },
  locationNoteText: {
    flex: 1,
    color: '#8D9892',
    fontSize: 11,
    lineHeight: 16
  },
  bottom: {
    marginTop: 'auto'
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 19,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '900'
  },
  backButton: {
    minHeight: 42,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  backText: {
    color: '#818C85',
    fontSize: 12,
    fontWeight: '800'
  },
  privacy: {
    marginTop: 13,
    color: '#707B74',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center'
  }
});
