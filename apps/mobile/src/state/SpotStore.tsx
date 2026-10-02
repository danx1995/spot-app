import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  CloudConflictError,
  ensureGuestSession,
  getCloudState,
  putCloudState,
  type CloudStatePayload
} from '../services/cloudSync';
import { collections as demoCollections, spots as demoSpots } from '../data/mock';
import type { CitySlug, Collection, Spot, SpotStatus } from '../types';

const SAVED_SPOTS_KEY = '@spot/saved-places/v1';
const COLLECTIONS_KEY = '@spot/collections/v1';
const SELECTED_CITY_KEY = '@spot/selected-city/v1';

type NewCollectionInput = {
  title: string;
  subtitle?: string;
  city: CitySlug | 'both';
};

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict';

type SpotStoreValue = {
  savedSpots: Spot[];
  collections: Collection[];
  hydrated: boolean;
  selectedCity: CitySlug;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  setSelectedCity: (city: CitySlug) => void;
  syncNow: () => Promise<void>;
  isSaved: (id: string) => boolean;
  getSavedSpot: (id: string) => Spot | undefined;
  saveSpot: (spot: Spot, status?: SpotStatus) => void;
  removeSpot: (id: string) => void;
  updateStatus: (id: string, status: SpotStatus) => void;
  updateNote: (id: string, note: string) => void;
  toggleFavorite: (id: string) => void;
  createCollection: (input: NewCollectionInput) => Collection;
  deleteCollection: (id: string) => void;
  togglePlaceInCollection: (collectionId: string, placeId: string) => void;
};

const SpotStoreContext = createContext<SpotStoreValue | null>(null);

function cityLabel(city: CitySlug | 'both') {
  if (city === 'spb') return 'Санкт-Петербург';
  if (city === 'moscow') return 'Москва';
  return 'Москва · Петербург';
}

function newCollectionId() {
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function mergeByID<T extends { id: string }>(remote: T[], local: T[]) {
  const merged = new Map<string, T>();
  for (const item of remote) merged.set(item.id, item);
  for (const item of local) merged.set(item.id, item);
  return Array.from(merged.values());
}

function isCloudPayload(value: CloudStatePayload | null): value is CloudStatePayload {
  return Boolean(
    value &&
    (value.selected_city === 'spb' || value.selected_city === 'moscow') &&
    Array.isArray(value.saved_spots) &&
    Array.isArray(value.collections)
  );
}

export function SpotStoreProvider({ children }: { children: React.ReactNode }) {
  const [savedSpots, setSavedSpots] = useState<Spot[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCity, setSelectedCity] = useState<CitySlug>('spb');
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const cloudRevisionRef = useRef(0);
  const cloudReadyRef = useRef(false);
  const syncingRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const skipNextAutoRef = useRef(false);
  const snapshotRef = useRef({
    savedSpots,
    collections,
    selectedCity
  });

  snapshotRef.current = { savedSpots, collections, selectedCity };

  useEffect(() => {
    let active = true;

    void Promise.all([
      AsyncStorage.getItem(SAVED_SPOTS_KEY),
      AsyncStorage.getItem(COLLECTIONS_KEY),
      AsyncStorage.getItem(SELECTED_CITY_KEY)
    ])
      .then(([rawSpots, rawCollections, rawCity]) => {
        if (!active) return;

        if (!rawSpots) {
          setSavedSpots(demoSpots);
        } else {
          try {
            const parsed = JSON.parse(rawSpots) as Spot[];
            setSavedSpots(Array.isArray(parsed) ? parsed : demoSpots);
          } catch {
            setSavedSpots(demoSpots);
          }
        }

        if (!rawCollections) {
          setCollections(demoCollections);
        } else {
          try {
            const parsed = JSON.parse(rawCollections) as Collection[];
            setCollections(Array.isArray(parsed) ? parsed : demoCollections);
          } catch {
            setCollections(demoCollections);
          }
        }

        if (rawCity === 'spb' || rawCity === 'moscow') {
          setSelectedCity(rawCity);
        }
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(SAVED_SPOTS_KEY, JSON.stringify(savedSpots));
  }, [hydrated, savedSpots]);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
  }, [collections, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(SELECTED_CITY_KEY, selectedCity);
  }, [hydrated, selectedCity]);

  const applyCloudPayload = useCallback((payload: CloudStatePayload) => {
    skipNextAutoRef.current = true;
    setSavedSpots(payload.saved_spots);
    setCollections(payload.collections);
    setSelectedCity(payload.selected_city);
  }, []);

  const syncNow = useCallback(async () => {
    if (!hydrated) return;

    if (syncingRef.current) {
      pendingSyncRef.current = true;
      return;
    }

    syncingRef.current = true;
    setSyncStatus('syncing');

    try {
      const session = await ensureGuestSession();
      let local = snapshotRef.current;

      if (!cloudReadyRef.current) {
        const remote = await getCloudState(session.token);

        if (isCloudPayload(remote.state)) {
          const merged: CloudStatePayload = {
            selected_city: local.selectedCity,
            saved_spots: mergeByID(remote.state.saved_spots, local.savedSpots),
            collections: mergeByID(remote.state.collections, local.collections)
          };

          const saved = await putCloudState(session.token, remote.revision, merged);
          cloudRevisionRef.current = saved.revision;
          applyCloudPayload(merged);
        } else {
          const initial: CloudStatePayload = {
            selected_city: local.selectedCity,
            saved_spots: local.savedSpots,
            collections: local.collections
          };
          const saved = await putCloudState(session.token, 0, initial);
          cloudRevisionRef.current = saved.revision;
        }

        cloudReadyRef.current = true;
      } else {
        const payload: CloudStatePayload = {
          selected_city: local.selectedCity,
          saved_spots: local.savedSpots,
          collections: local.collections
        };

        try {
          const saved = await putCloudState(session.token, cloudRevisionRef.current, payload);
          cloudRevisionRef.current = saved.revision;
        } catch (error) {
          if (!(error instanceof CloudConflictError) || !isCloudPayload(error.envelope.state)) {
            throw error;
          }

          setSyncStatus('conflict');

          const merged: CloudStatePayload = {
            selected_city: payload.selected_city,
            saved_spots: mergeByID(error.envelope.state.saved_spots, payload.saved_spots),
            collections: mergeByID(error.envelope.state.collections, payload.collections)
          };

          const retried = await putCloudState(session.token, error.envelope.revision, merged);
          cloudRevisionRef.current = retried.revision;
          applyCloudPayload(merged);
        }
      }

      setLastSyncedAt(new Date().toISOString());
      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    } finally {
      syncingRef.current = false;

      if (pendingSyncRef.current) {
        pendingSyncRef.current = false;
        setTimeout(() => {
          void syncNow();
        }, 0);
      }
    }
  }, [applyCloudPayload, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void syncNow();
  }, [hydrated, syncNow]);

  useEffect(() => {
    if (!hydrated || !cloudReadyRef.current) return;

    if (skipNextAutoRef.current) {
      skipNextAutoRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      void syncNow();
    }, 1200);

    return () => clearTimeout(timer);
  }, [collections, hydrated, savedSpots, selectedCity, syncNow]);

  const getSavedSpot = useCallback(
    (id: string) => savedSpots.find((spot) => spot.id === id),
    [savedSpots]
  );

  const isSaved = useCallback(
    (id: string) => savedSpots.some((spot) => spot.id === id),
    [savedSpots]
  );

  const saveSpot = useCallback((spot: Spot, status: SpotStatus = 'want') => {
    setSavedSpots((current) => {
      const existing = current.find((item) => item.id === spot.id);
      if (existing) {
        return current.map((item) => item.id === spot.id ? { ...item, ...spot, status: existing.status } : item);
      }
      return [{ ...spot, status }, ...current];
    });
  }, []);

  const removeSpot = useCallback((id: string) => {
    setSavedSpots((current) => current.filter((spot) => spot.id !== id));
    setCollections((current) => current.map((collection) => ({
      ...collection,
      placeIds: collection.placeIds.filter((placeId) => placeId !== id)
    })));
  }, []);

  const updateStatus = useCallback((id: string, status: SpotStatus) => {
    setSavedSpots((current) => current.map((spot) => spot.id === id ? { ...spot, status } : spot));
  }, []);

  const updateNote = useCallback((id: string, note: string) => {
    setSavedSpots((current) => current.map((spot) => (
      spot.id === id ? { ...spot, note: note.trim() || undefined } : spot
    )));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setSavedSpots((current) => current.map((spot) => spot.id === id ? { ...spot, favorite: !spot.favorite } : spot));
  }, []);

  const createCollection = useCallback((input: NewCollectionInput) => {
    const collection: Collection = {
      id: newCollectionId(),
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || 'Моя подборка',
      city: input.city,
      cityLabel: cityLabel(input.city),
      placeIds: [],
      createdAt: new Date().toISOString()
    };
    setCollections((current) => [collection, ...current]);
    return collection;
  }, []);

  const deleteCollection = useCallback((id: string) => {
    setCollections((current) => current.filter((collection) => collection.id !== id));
  }, []);

  const togglePlaceInCollection = useCallback((collectionId: string, placeId: string) => {
    setCollections((current) => current.map((collection) => {
      if (collection.id !== collectionId) return collection;
      const exists = collection.placeIds.includes(placeId);
      return {
        ...collection,
        placeIds: exists
          ? collection.placeIds.filter((id) => id !== placeId)
          : [...collection.placeIds, placeId]
      };
    }));
  }, []);

  const value = useMemo<SpotStoreValue>(() => ({
    savedSpots,
    collections,
    hydrated,
    selectedCity,
    syncStatus,
    lastSyncedAt,
    setSelectedCity,
    syncNow,
    isSaved,
    getSavedSpot,
    saveSpot,
    removeSpot,
    updateStatus,
    updateNote,
    toggleFavorite,
    createCollection,
    deleteCollection,
    togglePlaceInCollection
  }), [
    savedSpots,
    collections,
    hydrated,
    selectedCity,
    syncStatus,
    lastSyncedAt,
    syncNow,
    isSaved,
    getSavedSpot,
    saveSpot,
    removeSpot,
    updateStatus,
    updateNote,
    toggleFavorite,
    createCollection,
    deleteCollection,
    togglePlaceInCollection
  ]);

  return <SpotStoreContext.Provider value={value}>{children}</SpotStoreContext.Provider>;
}

export function useSpotStore() {
  const value = useContext(SpotStoreContext);
  if (!value) {
    throw new Error('useSpotStore must be used inside SpotStoreProvider');
  }
  return value;
}
