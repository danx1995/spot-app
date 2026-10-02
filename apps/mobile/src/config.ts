declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
  };
};

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const appConfig = {
  apiBaseUrl: configuredApiUrl && configuredApiUrl.length > 0
    ? configuredApiUrl.replace(/\/$/, '')
    : 'http://localhost:8080'
} as const;
