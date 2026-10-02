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

import { appConfig } from '../config';

type InboundImportValue = {
  pendingURL: string | null;
  pendingHint: string | null;
  pendingCollectionID: string | null;
  pendingPlaceID: string | null;
  consumePendingURL: () => void;
  consumePendingCollection: () => void;
  consumePendingPlace: () => void;
};

type InboundDeepLink =
  | { type: 'place-import'; url: string; hint: string | null }
  | { type: 'shared-place'; id: string }
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

function validPublicID(value: string) {
  return /^[A-Za-z0-9_.-]{1,128}$/.test(value);
}

function extractPublicResource(value: string) {
  const targets = Array.from(new Set([
    appConfig.shareBaseUrl,
    appConfig.apiBaseUrl
  ]));

  for (const base of targets) {
    const normalizedBase = base.replace(/\/$/, '');
    for (const [prefixPath, type] of [
      ['/s/', 'collection'],
      ['/p/', 'shared-place']
    ] as const) {
      const prefix = `${normalizedBase}${prefixPath}`;
      if (!value.startsWith(prefix)) continue;

      const encodedID = value.slice(prefix.length).split(/[?#]/, 1)[0];
      if (!encodedID) return null;

      try {
        const id = decodeURIComponent(encodedID).trim();
        if (!validPublicID(id)) return null;
        return { type, id } as const;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function extractInboundDeepLink(appURL: string): InboundDeepLink | null {
  const normalized = appURL.trim();

  const publicResource = extractPublicResource(normalized);
  if (publicResource) {
    return publicResource;
  }

  const queryIndex = normalized.indexOf('?');
  const path = queryIndex === -1 ? normalized : normalized.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex === -1 ? '' : normalized.slice(queryIndex + 1));

  if (path === 'spot://collection' || path === 'spot:///collection') {
    const id = params.get('id')?.trim();
    if (!id || !validPublicID(id)) return null;
    return { type: 'collection', id };
  }

  if (path === 'spot://place' || path === 'spot:///place') {
    const id = params.get('id')?.trim();
    if (!id || !validPublicID(id)) return null;
    return { type: 'shared-place', id };
  }

  if (path !== 'spot://import' && path !== 'spot:///import') {
    return null;
  }

  const target = params.get('url')?.trim();
  if (!target || (!target.startsWith('https://') && !target.startsWith('http://'))) {
    return null;
  }

  const hint = params.get('hint')?.trim() || null;
  return { type: 'place-import', url: target, hint };
}

export function InboundImportProvider({ children }: { children: React.ReactNode }) {
  const [pendingURL, setPendingURL] = useState<string | null>(null);
  const [pendingHint, setPendingHint] = useState<string | null>(null);
  const [pendingCollectionID, setPendingCollectionID] = useState<string | null>(null);
  const [pendingPlaceID, setPendingPlaceID] = useState<string | null>(null);
  const {
    hasShareIntent,
    shareIntent,
    resetShareIntent
  } = useShareIntentContext();

  const receive = useCallback((appURL: string | null, fallbackHint?: string | null) => {
    if (!appURL) return false;

    const incoming = extractInboundDeepLink(appURL);
    if (!incoming) return false;

    if (incoming.type === 'collection') {
      setPendingCollectionID(incoming.id);
      setPendingPlaceID(null);
      setPendingURL(null);
      setPendingHint(null);
      return true;
    }

    if (incoming.type === 'shared-place') {
      setPendingPlaceID(incoming.id);
      setPendingCollectionID(null);
      setPendingURL(null);
      setPendingHint(null);
      return true;
    }

    setPendingURL(incoming.url);
    setPendingHint(incoming.hint ?? fallbackHint ?? null);
    setPendingCollectionID(null);
    setPendingPlaceID(null);
    return true;
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

      if (!receive(target, hint)) {
        setPendingURL(target);
        setPendingHint(hint);
        setPendingCollectionID(null);
        setPendingPlaceID(null);
      }
    }

    resetShareIntent();
  }, [hasShareIntent, receive, resetShareIntent, shareIntent]);

  const consumePendingURL = useCallback(() => {
    setPendingURL(null);
    setPendingHint(null);
  }, []);

  const consumePendingCollection = useCallback(() => {
    setPendingCollectionID(null);
  }, []);

  const consumePendingPlace = useCallback(() => {
    setPendingPlaceID(null);
  }, []);

  const value = useMemo(
    () => ({
      pendingURL,
      pendingHint,
      pendingCollectionID,
      pendingPlaceID,
      consumePendingURL,
      consumePendingCollection,
      consumePendingPlace
    }),
    [
      consumePendingCollection,
      consumePendingPlace,
      consumePendingURL,
      pendingCollectionID,
      pendingPlaceID,
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
