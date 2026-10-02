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
