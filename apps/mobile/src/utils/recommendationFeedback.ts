import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISSED_RECOMMENDATIONS_KEY = '@spot/dismissed-recommendations/v1';
const MAX_DISMISSED_RECOMMENDATIONS = 200;

function normalizeIDs(value: unknown) {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) continue;
    unique.add(item.trim());
  }

  return Array.from(unique).slice(-MAX_DISMISSED_RECOMMENDATIONS);
}

export async function getDismissedRecommendationIDs() {
  const raw = await AsyncStorage.getItem(DISMISSED_RECOMMENDATIONS_KEY);
  if (!raw) return [] as string[];

  try {
    return normalizeIDs(JSON.parse(raw) as unknown);
  } catch {
    return [] as string[];
  }
}

export async function saveDismissedRecommendationIDs(ids: string[]) {
  const normalized = normalizeIDs(ids);
  await AsyncStorage.setItem(
    DISMISSED_RECOMMENDATIONS_KEY,
    JSON.stringify(normalized)
  );
  return normalized;
}

export async function dismissRecommendationID(id: string) {
  const current = await getDismissedRecommendationIDs();
  return await saveDismissedRecommendationIDs([
    ...current.filter((item) => item !== id),
    id
  ]);
}

export async function clearDismissedRecommendations() {
  await AsyncStorage.removeItem(DISMISSED_RECOMMENDATIONS_KEY);
}
