import AsyncStorage from '@react-native-async-storage/async-storage';

import { appConfig } from '../config';
import type { CitySlug, Collection, DiscoveryInterest, Spot } from '../types';

const SESSION_TOKEN_KEY = '@spot/cloud-session-token/v1';
const SESSION_USER_KEY = '@spot/cloud-user-id/v1';

export type CloudStatePayload = {
  selected_city: CitySlug;
  saved_spots: Spot[];
  collections: Collection[];
  interests?: DiscoveryInterest[];
};

export type CloudEnvelope = {
  revision: number;
  state: CloudStatePayload | null;
  updated_at: string | null;
};

export type GuestSession = {
  user_id: string;
  token: string;
};

export class CloudConflictError extends Error {
  envelope: CloudEnvelope;

  constructor(envelope: CloudEnvelope) {
    super('cloud revision conflict');
    this.name = 'CloudConflictError';
    this.envelope = envelope;
  }
}

async function parseJSON<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export async function ensureGuestSession(): Promise<GuestSession> {
  const [token, userID] = await Promise.all([
    AsyncStorage.getItem(SESSION_TOKEN_KEY),
    AsyncStorage.getItem(SESSION_USER_KEY)
  ]);

  if (token && userID) {
    return { token, user_id: userID };
  }

  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/auth/guest`, {
    method: 'POST',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`guest session failed with ${response.status}`);
  }

  const session = await parseJSON<GuestSession>(response);
  await Promise.all([
    AsyncStorage.setItem(SESSION_TOKEN_KEY, session.token),
    AsyncStorage.setItem(SESSION_USER_KEY, session.user_id)
  ]);

  return session;
}

export async function replaceGuestSession(session: GuestSession) {
  await Promise.all([
    AsyncStorage.setItem(SESSION_TOKEN_KEY, session.token),
    AsyncStorage.setItem(SESSION_USER_KEY, session.user_id)
  ]);
}

export async function resetGuestSession() {
  await Promise.all([
    AsyncStorage.removeItem(SESSION_TOKEN_KEY),
    AsyncStorage.removeItem(SESSION_USER_KEY)
  ]);
}

export async function getCloudState(token: string): Promise<CloudEnvelope> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/me/state`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    await resetGuestSession();
    throw new Error('session expired');
  }
  if (!response.ok) {
    throw new Error(`cloud load failed with ${response.status}`);
  }

  return await parseJSON<CloudEnvelope>(response);
}

export async function putCloudState(
  token: string,
  baseRevision: number,
  state: CloudStatePayload
): Promise<CloudEnvelope> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/me/state`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      base_revision: baseRevision,
      state
    })
  });

  if (response.status === 401) {
    await resetGuestSession();
    throw new Error('session expired');
  }

  const envelope = await parseJSON<CloudEnvelope>(response);

  if (response.status === 409) {
    throw new CloudConflictError(envelope);
  }
  if (!response.ok) {
    throw new Error(`cloud save failed with ${response.status}`);
  }

  return envelope;
}
