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
  pendingCollectionID: string | null;
  consumePendingURL: () => void;
  consumePendingCollection: () => void;
};

type InboundDeepLink =
  | { type: 'place'; url: string; hint: string | null }
  | { type: 'collection'; id: string };

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

function validCollectionID(value: string) {
  return /^[A-Za-z0-9_.-]{1,128}$/.test(value);
}

function extractInboundDeepLink(appURL: string): InboundDeepLink | null {
  const normalized = appURL.trim();
  const queryIndex = normalized.indexOf('?');
  const path = queryIndex === -1 ? normalized : normalized.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex === -1 ? '' : normalized.slice(queryIndex + 1));

  if (path === 'spot://collection' || path === 'spot:///collection') {
    const id = params.get('id')?.trim();
    if (!id || !validCollectionID(id)) return null;
    return { type: 'collection', id };
  }

  if (path !== 'spot://import' && path !== 'spot:///import') {
    return null;
  }

  const target = params.get('url')?.trim();
  if (!target || (!target.startsWith('https://') && !target.startsWith('http://'))) {
    return null;
  }

  const hint = params.get('hint')?.trim() || null;
  return { type: 'place', url: target, hint };
}

export function InboundImportProvider({ children }: { children: React.ReactNode }) {
  const [pendingURL, setPendingURL] = useState<string | null>(null);
  const [pendingHint, setPendingHint] = useState<string | null>(null);
  const [pendingCollectionID, setPendingCollectionID] = useState<string | null>(null);
  const {
    hasShareIntent,
    shareIntent,
    resetShareIntent
  } = useShareIntentContext();

  const receive = useCallback((appURL: string | null) => {
    if (!appURL) return;
    const incoming = extractInboundDeepLink(appURL);
    if (!incoming) return;

    if (incoming.type === 'collection') {
      setPendingCollectionID(incoming.id);
      setPendingURL(null);
      setPendingHint(null);
      return;
    }

    setPendingURL(incoming.url);
    setPendingHint(incoming.hint);
    setPendingCollectionID(null);
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
      setPendingCollectionID(null);
    }

    resetShareIntent();
  }, [hasShareIntent, resetShareIntent, shareIntent]);

  const consumePendingURL = useCallback(() => {
    setPendingURL(null);
    setPendingHint(null);
  }, []);

  const consumePendingCollection = useCallback(() => {
    setPendingCollectionID(null);
  }, []);

  const value = useMemo(
    () => ({
      pendingURL,
      pendingHint,
      pendingCollectionID,
      consumePendingURL,
      consumePendingCollection
    }),
    [
      consumePendingCollection,
      consumePendingURL,
      pendingCollectionID,
      pendingHint,
      pendingURL
    ]
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
