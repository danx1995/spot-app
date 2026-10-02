import React from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors } from '../theme';

const actions = [
  { symbol: '⌕', title: 'Найти место', subtitle: 'По названию или адресу' },
  { symbol: '↗', title: 'Вставить ссылку', subtitle: 'Reels, TikTok, Telegram или сайт' },
  { symbol: '+', title: 'Добавить вручную', subtitle: 'Если места пока нет в СПОТ' }
];

export function AddScreen() {
  const dark = useColorScheme() === 'dark';
  const text = dark ? colors.white : colors.black;
  const muted = dark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = dark ? colors.darkSurface : colors.white;

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <View style={styles.mark}><Text style={styles.markHeart}>♥</Text></View>
      <Text style={[styles.title, { color: text }]}>Добавить в СПОТ</Text>
      <Text style={[styles.subtitle, { color: muted }]}>Сохрани место сейчас — вернись к нему, когда окажешься рядом.</Text>

      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable key={action.title} style={[styles.action, { backgroundColor: surface }]}>
            <View style={styles.actionIcon}><Text style={styles.actionSymbol}>{action.symbol}</Text></View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, { color: text }]}>{action.title}</Text>
              <Text style={[styles.actionSubtitle, { color: muted }]}>{action.subtitle}</Text>
            </View>
            <Text style={[styles.chevron, { color: muted }]}>›</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.tip, { backgroundColor: dark ? colors.darkSurfaceRaised : '#E7F8F0' }]}>
        <Text style={styles.tipIcon}>✦</Text>
        <Text style={[styles.tipText, { color: text }]}>Скоро: отправляй Reel через «Поделиться → СПОТ», и мы сами найдём место.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 74,
    paddingHorizontal: 20
  },
  mark: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  markHeart: { color: colors.black, fontSize: 25 },
  title: {
    marginTop: 24,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1
  },
  subtitle: {
    marginTop: 10,
    maxWidth: 330,
    fontSize: 16,
    lineHeight: 23
  },
  actions: {
    marginTop: 30,
    gap: 10
  },
  action: {
    minHeight: 82,
    borderRadius: 22,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionSymbol: {
    color: colors.black,
    fontSize: 24,
    fontWeight: '900'
  },
  actionCopy: {
    flex: 1,
    marginLeft: 14
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  actionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17
  },
  chevron: {
    fontSize: 28,
    marginLeft: 8
  },
  tip: {
    marginTop: 18,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    gap: 12
  },
  tipIcon: {
    color: colors.green,
    fontSize: 20
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  }
});
