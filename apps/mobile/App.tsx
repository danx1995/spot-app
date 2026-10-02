import React from 'react';
import { Text, View, StyleSheet, useColorScheme } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

function Screen({ title, subtitle }: { title: string; subtitle: string }) {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={[styles.screen, { backgroundColor: dark ? colors.black : colors.lightBackground }]}>
      <Text style={[styles.title, { color: dark ? colors.white : colors.black }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: dark ? colors.textSecondaryDark : colors.textSecondaryLight }]}>
        {subtitle}
      </Text>
    </View>
  );
}

const MapScreen = () => <Screen title="Санкт-Петербург" subtitle="Твои споты появятся на карте здесь." />;
const SpotsScreen = () => <Screen title="Мои споты" subtitle="Все места, куда хочется попасть." />;
const AddScreen = () => <Screen title="Добавить спот" subtitle="Найти место · Вставить ссылку · Добавить вручную" />;
const CollectionsScreen = () => <Screen title="Подборки" subtitle="Собирай места по настроению и поездкам." />;
const ProfileScreen = () => <Screen title="Профиль" subtitle="Аккаунт, тема и настройки СПОТ." />;

export default function App() {
  const isDark = useColorScheme() === 'dark';

  const navigationTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: colors.green,
          background: colors.black,
          card: colors.darkSurface,
          border: colors.darkSurfaceRaised
        }
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.green,
          background: colors.lightBackground,
          card: colors.white,
          border: colors.lightMuted
        }
      };

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.green,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarStyle: {
            height: 72,
            paddingTop: 8,
            paddingBottom: 10,
            borderTopWidth: 0
          }
        }}
      >
        <Tab.Screen name="Карта" component={MapScreen} />
        <Tab.Screen name="Споты" component={SpotsScreen} />
        <Tab.Screen name="+" component={AddScreen} />
        <Tab.Screen name="Подборки" component={CollectionsScreen} />
        <Tab.Screen name="Профиль" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8
  },
  subtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 23
  }
});
