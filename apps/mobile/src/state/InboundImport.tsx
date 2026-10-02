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
  consumePendingURL: () => void;
};

const InboundImportContext = createContext<InboundImportValue | null>(null);

function extractFirstHTTPURL(text: string | null | undefined) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>'"]+/i);
  return match?.[0]?.replace(/[),.;!?]+$/, '') ?? null;
}

function extractTargetURL(appURL: string) {
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

  return target;
}

export function InboundImportProvider({ children }: { children: React.ReactNode }) {
  const [pendingURL, setPendingURL] = useState<string | null>(null);
  const {
    hasShareIntent,
    shareIntent,
    resetShareIntent
  } = useShareIntentContext();

  const receive = useCallback((appURL: string | null) => {
    if (!appURL) return;
    const target = extractTargetURL(appURL);
    if (target) {
      setPendingURL(target);
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
      setPendingURL(target);
    }

    resetShareIntent();
  }, [hasShareIntent, resetShareIntent, shareIntent]);

  const consumePendingURL = useCallback(() => {
    setPendingURL(null);
  }, []);

  const value = useMemo(
    () => ({ pendingURL, consumePendingURL }),
    [consumePendingURL, pendingURL]
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
