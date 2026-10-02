export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }

  interface TelegramWebApp {
    initData: string;
    initDataUnsafe?: {
      user?: {
        id: number;
        first_name: string;
        last_name?: string;
        username?: string;
        photo_url?: string;
      };
    };
    colorScheme?: 'light' | 'dark';
    themeParams?: Record<string, string>;
    platform?: string;
    version?: string;
    ready(): void;
    expand(): void;
    close(): void;
    setHeaderColor?(color: string): void;
    setBackgroundColor?(color: string): void;
    disableVerticalSwipes?(): void;
    openLink?(url: string, options?: { try_instant_view?: boolean }): void;
    openTelegramLink?(url: string): void;
    LocationManager?: {
      isInited: boolean;
      isLocationAvailable: boolean;
      isAccessRequested: boolean;
      isAccessGranted: boolean;
      init(callback?: () => void): void;
      getLocation(callback: (location: {
        latitude: number;
        longitude: number;
        altitude?: number;
        course?: number;
        speed?: number;
        horizontal_accuracy?: number;
        vertical_accuracy?: number;
      } | null) => void): void;
      openSettings(): void;
    };
    HapticFeedback?: {
      impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
      notificationOccurred(type: 'error' | 'success' | 'warning'): void;
      selectionChanged(): void;
    };
    BackButton?: {
      show(): void;
      hide(): void;
      onClick(callback: () => void): void;
      offClick(callback: () => void): void;
    };
  }
}
