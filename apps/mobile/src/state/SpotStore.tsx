import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { spots as demoSpots } from '../data/mock';
import type { CitySlug, Spot, SpotStatus } from '../types';

const SAVED_SPOTS_KEY = '@spot/saved-places/v1';
const SELECTED_CITY_KEY = '@spot/selected-city/v1';

type SpotStoreValue = {
  savedSpots: Spot[];
  hydrated: boolean;
  selectedCity: CitySlug;
  setSelectedCity: (city: CitySlug) => void;
  isSaved: (id: string) => boolean;
  getSavedSpot: (id: string) => Spot | undefined;
  saveSpot: (spot: Spot, status?: SpotStatus) => void;
  removeSpot: (id: string) => void;
  updateStatus: (id: string, status: SpotStatus) => void;
  toggleFavorite: (id: string) => void;
};

const SpotStoreContext = createContext<SpotStoreValue | null>(null);

export function SpotStoreProvider({ children }: { children: React.ReactNode }) {
  const [savedSpots, setSavedSpots] = useState<Spot[]>([]);
  const [selectedCity, setSelectedCity] = useState<CitySlug>('spb');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    void Promise.all([
      AsyncStorage.getItem(SAVED_SPOTS_KEY),
      AsyncStorage.getItem(SELECTED_CITY_KEY)
    ])
      .then(([rawSpots, rawCity]) => {
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
  }, []);

  const updateStatus = useCallback((id: string, status: SpotStatus) => {
    setSavedSpots((current) => current.map((spot) => spot.id === id ? { ...spot, status } : spot));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setSavedSpots((current) => current.map((spot) => spot.id === id ? { ...spot, favorite: !spot.favorite } : spot));
  }, []);

  const value = useMemo<SpotStoreValue>(() => ({
    savedSpots,
    hydrated,
    selectedCity,
    setSelectedCity,
    isSaved,
    getSavedSpot,
    saveSpot,
    removeSpot,
    updateStatus,
    toggleFavorite
  }), [
    savedSpots,
    hydrated,
    selectedCity,
    isSaved,
    getSavedSpot,
    saveSpot,
    removeSpot,
    updateStatus,
    toggleFavorite
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
