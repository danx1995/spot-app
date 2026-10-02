import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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

type SpotStoreValue = {
  savedSpots: Spot[];
  collections: Collection[];
  hydrated: boolean;
  selectedCity: CitySlug;
  setSelectedCity: (city: CitySlug) => void;
  isSaved: (id: string) => boolean;
  getSavedSpot: (id: string) => Spot | undefined;
  saveSpot: (spot: Spot, status?: SpotStatus) => void;
  removeSpot: (id: string) => void;
  updateStatus: (id: string, status: SpotStatus) => void;
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

export function SpotStoreProvider({ children }: { children: React.ReactNode }) {
  const [savedSpots, setSavedSpots] = useState<Spot[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCity, setSelectedCity] = useState<CitySlug>('spb');
  const [hydrated, setHydrated] = useState(false);

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
    setSelectedCity,
    isSaved,
    getSavedSpot,
    saveSpot,
    removeSpot,
    updateStatus,
    toggleFavorite,
    createCollection,
    deleteCollection,
    togglePlaceInCollection
  }), [
    savedSpots,
    collections,
    hydrated,
    selectedCity,
    isSaved,
    getSavedSpot,
    saveSpot,
    removeSpot,
    updateStatus,
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
