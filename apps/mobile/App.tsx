import React, { useState } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';

import { colors } from './src/theme';
import { AddScreen } from './src/screens/AddScreen';
import { CollectionsScreen } from './src/screens/CollectionsScreen';
import { MapScreen } from './src/screens/MapScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SpotsScreen } from './src/screens/SpotsScreen';

const Tab = createBottomTabNavigator();

const icons: Record<string, string> = {
  'Карта': '⌖',
  'Споты': '♥',
  '+': '+',
  'Подборки': '▦',
  'Профиль': '●'
};

export default function App() {
  const isDark = useColorScheme() === 'dark';
  const [onboarded, setOnboarded] = useState(false);

  if (!onboarded) {
    return (
      <>
        <StatusBar style="light" />
        <OnboardingScreen onComplete={() => setOnboarded(true)} />
      </>
    );
  }

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
        initialRouteName="Карта"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.green,
          tabBarInactiveTintColor: isDark ? '#7E8983' : '#7B837E',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '700',
            marginTop: 1
          },
          tabBarIcon: ({ color, focused }) => {
            const isAdd = route.name === '+';
            return (
              <View style={[
                styles.tabIcon,
                isAdd && styles.addIcon,
                isAdd && { backgroundColor: colors.green }
              ]}>
                <Text style={[
                  styles.tabSymbol,
                  { color: isAdd ? colors.black : color },
                  focused && !isAdd && styles.tabSymbolActive
                ]}>
                  {icons[route.name]}
                </Text>
              </View>
            );
          },
          tabBarStyle: {
            height: 78,
            paddingTop: 7,
            paddingBottom: 10,
            borderTopWidth: 0,
            backgroundColor: isDark ? '#101512' : colors.white,
            elevation: 0,
            shadowOpacity: 0.08,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: -5 }
          }
        })}
      >
        <Tab.Screen name="Карта" component={MapScreen} />
        <Tab.Screen name="Споты" component={SpotsScreen} />
        <Tab.Screen
          name="+"
          component={AddScreen}
          options={{ tabBarLabel: 'Добавить' }}
        />
        <Tab.Screen name="Подборки" component={CollectionsScreen} />
        <Tab.Screen name="Профиль" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    width: 30,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addIcon: {
    width: 44,
    height: 44,
    marginTop: -14,
    borderRadius: 22
  },
  tabSymbol: {
    fontSize: 19,
    fontWeight: '800'
  },
  tabSymbolActive: {
    transform: [{ scale: 1.06 }]
  }
});
