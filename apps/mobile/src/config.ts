declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_SHARE_URL?: string;
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?: string;
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
  };
};

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const configuredShareUrl = process.env.EXPO_PUBLIC_SHARE_URL?.trim();

const apiBaseUrl = configuredApiUrl && configuredApiUrl.length > 0
  ? configuredApiUrl.replace(/\/$/, '')
  : 'http://localhost:8080';

export const appConfig = {
  apiBaseUrl,
  shareBaseUrl: configuredShareUrl && configuredShareUrl.length > 0
    ? configuredShareUrl.replace(/\/$/, '')
    : apiBaseUrl,
  googleAuth: {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() || undefined,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || undefined
  }
} as const;
