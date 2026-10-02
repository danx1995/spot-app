import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useShareIntentContext } from 'expo-share-intent';
import { Linking } from 'react-native';

type InboundImportValue = {
  pendingURL: string | null;
  pendingHint: string | null;
  consumePendingURL: () => void;
};

const InboundImportContext = createContext<InboundImportValue | null>(null);

function extractFirstHTTPURL(text: string | null | undefined) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>'"]+/i);
  return match?.[0]?.replace(/[),.;!?]+$/, '') ?? null;
}

function cleanSharedHint(text: string | null | undefined, targetURL: string) {
  if (!text) return null;

  const withoutTarget = text
    .replace(targetURL, ' ')
    .replace(/https?:\/\/[^\s<>'"]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (withoutTarget.length < 2) return null;
  return withoutTarget.slice(0, 180);
}

function extractInboundDeepLink(appURL: string) {
  const normalized = appURL.trim();
  if (!normalized.startsWith('spot://import') && !normalized.startsWith('spot:///import')) {
    return null;
  }

  const queryIndex = normalized.indexOf('?');
  if (queryIndex === -1) return null;

  const params = new URLSearchParams(normalized.slice(queryIndex + 1));
  const target = params.get('url')?.trim();
  if (!target || (!target.startsWith('https://') && !target.startsWith('http://'))) {
    return null;
  }

  const hint = params.get('hint')?.trim() || null;
  return { url: target, hint };
}

export function InboundImportProvider({ children }: { children: React.ReactNode }) {
  const [pendingURL, setPendingURL] = useState<string | null>(null);
  const [pendingHint, setPendingHint] = useState<string | null>(null);
  const {
    hasShareIntent,
    shareIntent,
    resetShareIntent
  } = useShareIntentContext();

  const receive = useCallback((appURL: string | null) => {
    if (!appURL) return;
    const incoming = extractInboundDeepLink(appURL);
    if (incoming) {
      setPendingURL(incoming.url);
      setPendingHint(incoming.hint);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void Linking.getInitialURL().then((url) => {
      if (active) receive(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      receive(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [receive]);

  useEffect(() => {
    if (!hasShareIntent) return;

    const target = shareIntent.webUrl?.trim() || extractFirstHTTPURL(shareIntent.text);
    if (target) {
      const metaTitle = shareIntent.meta && typeof shareIntent.meta.title === 'string'
        ? shareIntent.meta.title
        : null;
      const hint = cleanSharedHint(metaTitle || shareIntent.text, target);

      setPendingURL(target);
      setPendingHint(hint);
    }

    resetShareIntent();
  }, [hasShareIntent, resetShareIntent, shareIntent]);

  const consumePendingURL = useCallback(() => {
    setPendingURL(null);
    setPendingHint(null);
  }, []);

  const value = useMemo(
    () => ({ pendingURL, pendingHint, consumePendingURL }),
    [consumePendingURL, pendingHint, pendingURL]
  );

  return (
    <InboundImportContext.Provider value={value}>
      {children}
    </InboundImportContext.Provider>
  );
}

export function useInboundImport() {
  const value = useContext(InboundImportContext);
  if (!value) {
    throw new Error('useInboundImport must be used inside InboundImportProvider');
  }
  return value;
}
