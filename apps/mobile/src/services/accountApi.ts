import { appConfig } from '../config';
import type { CitySlug } from '../types';
import {
  ensureGuestSession,
  resetGuestSession,
  type GuestSession
} from './cloudSync';

export type AccountProfile = {
  id: string;
  is_guest: boolean;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  home_city?: CitySlug;
  theme: 'system' | 'light' | 'dark';
  created_at: string;
  updated_at: string;
  last_seen_at?: string;
};

export type AccountProfilePatch = {
  display_name?: string;
  avatar_url?: string;
  home_city?: CitySlug | '';
  theme?: 'system' | 'light' | 'dark';
};

async function authorizedProfileRequest(
  method: 'GET' | 'PATCH',
  patch?: AccountProfilePatch
): Promise<AccountProfile> {
  const session = await ensureGuestSession();
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/me/profile`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(patch ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.token}`
    },
    body: patch ? JSON.stringify(patch) : undefined
  });

  if (response.status === 401) {
    await resetGuestSession();
    throw new Error('session expired');
  }
  if (!response.ok) {
    throw new Error(`profile request failed with ${response.status}`);
  }

  return await response.json() as AccountProfile;
}

export async function getAccountProfile() {
  return await authorizedProfileRequest('GET');
}

export async function updateAccountProfile(patch: AccountProfilePatch) {
  return await authorizedProfileRequest('PATCH', patch);
}


export type TransferCode = {
  code: string;
  expires_at: string;
};

export async function createTransferCode(): Promise<TransferCode> {
  const session = await ensureGuestSession();
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/me/transfer-code`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.token}`
    }
  });

  if (response.status === 401) {
    await resetGuestSession();
    throw new Error('session expired');
  }
  if (!response.ok) {
    throw new Error(`transfer code failed with ${response.status}`);
  }

  return await response.json() as TransferCode;
}

export async function redeemTransferCode(code: string): Promise<GuestSession> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/auth/transfer`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ code: code.trim() })
  });

  if (response.status === 401) {
    throw new Error('Код неверный, истёк или уже был использован');
  }
  if (!response.ok) {
    throw new Error(`profile transfer failed with ${response.status}`);
  }

  return await response.json() as GuestSession;
}


export type AuthProvider = 'google' | 'apple';

export class ProviderIdentityInUseError extends Error {
  constructor() {
    super('Этот вход уже связан с другим профилем СПОТ');
    this.name = 'ProviderIdentityInUseError';
  }
}

export async function getAuthProviders(): Promise<Record<AuthProvider, boolean>> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/auth/providers`, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`provider status failed with ${response.status}`);
  }

  return await response.json() as Record<AuthProvider, boolean>;
}

export async function linkProviderIdentity(
  provider: AuthProvider,
  idToken: string,
  nonce?: string
): Promise<AccountProfile> {
  const session = await ensureGuestSession();
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/me/identity/link`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`
    },
    body: JSON.stringify({
      provider,
      id_token: idToken,
      nonce: nonce?.trim() || undefined
    })
  });

  if (response.status === 401) {
    throw new Error('Не удалось подтвердить вход');
  }
  if (response.status === 409) {
    throw new ProviderIdentityInUseError();
  }
  if (!response.ok) {
    throw new Error(`identity link failed with ${response.status}`);
  }

  return await response.json() as AccountProfile;
}

export async function loginWithProvider(
  provider: AuthProvider,
  idToken: string,
  nonce?: string
): Promise<GuestSession> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/auth/provider`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      id_token: idToken,
      nonce: nonce?.trim() || undefined
    })
  });

  if (response.status === 404) {
    throw new Error('Этот аккаунт ещё не связан с профилем СПОТ');
  }
  if (response.status === 401) {
    throw new Error('Не удалось подтвердить вход');
  }
  if (!response.ok) {
    throw new Error(`provider login failed with ${response.status}`);
  }

  return await response.json() as GuestSession;
}
