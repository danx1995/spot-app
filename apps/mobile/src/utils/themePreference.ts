import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = '@spot/theme-preference/v1';

export function applyThemePreference(preference: ThemePreference) {
  Appearance.setColorScheme(preference === 'system' ? null : preference);
}

export async function getThemePreference(): Promise<ThemePreference> {
  const value = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'system';
}

export async function setThemePreference(preference: ThemePreference) {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
  applyThemePreference(preference);
}

export async function hydrateThemePreference() {
  const preference = await getThemePreference();
  applyThemePreference(preference);
  return preference;
}
