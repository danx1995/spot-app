import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';

import { InboundImportProvider, useInboundImport } from './src/state/InboundImport';
import { SpotStoreProvider, useSpotStore } from './src/state/SpotStore';
import { colors } from './src/theme';
import { AddScreen } from './src/screens/AddScreen';
import { CollectionsScreen } from './src/screens/CollectionsScreen';
import { MapScreen } from './src/screens/MapScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SpotsScreen } from './src/screens/SpotsScreen';

type RootTabParamList = {
  'Карта': undefined;
  'Споты': undefined;
  '+': undefined;
  'Подборки': undefined;
  'Профиль': undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const navigationRef = createNavigationContainerRef<RootTabParamList>();
const ONBOARDING_KEY = '@spot/onboarding-complete/v1';

const icons: Record<string, string> = {
  'Карта': '⌖',
  'Споты': '♥',
  '+': '+',
  'Подборки': '▦',
  'Профиль': '●'
};

function SpotApp() {
  const isDark = useColorScheme() === 'dark';
  const { setSelectedCity } = useSpotStore();
  const { pendingURL } = useInboundImport();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
      if (active) setOnboarded(value === '1');
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!pendingURL || !onboarded || !navigationRef.isReady()) return;
    navigationRef.navigate('+');
  }, [onboarded, pendingURL]);

  if (onboarded === null) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <View style={styles.loadingMark}><Text style={styles.loadingHeart}>♥</Text></View>
      </View>
    );
  }

  if (!onboarded) {
    return (
      <>
        <StatusBar style="light" />
        <OnboardingScreen
          onComplete={(city) => {
            setSelectedCity(city === 'moscow' ? 'moscow' : 'spb');
            setOnboarded(true);
            void AsyncStorage.setItem(ONBOARDING_KEY, '1');
          }}
        />
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
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => {
        if (pendingURL) {
          navigationRef.navigate('+');
        }
      }}
    >
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
        <Tab.Screen name="+" component={AddScreen} options={{ tabBarLabel: 'Добавить' }} />
        <Tab.Screen name="Подборки" component={CollectionsScreen} />
        <Tab.Screen name="Профиль" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <InboundImportProvider>
      <SpotStoreProvider>
        <SpotApp />
      </SpotStoreProvider>
    </InboundImportProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingMark: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingHeart: {
    color: colors.black,
    fontSize: 32,
    fontWeight: '900'
  },
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
