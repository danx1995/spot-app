declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_SHARE_URL?: string;
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
    : apiBaseUrl
} as const;
