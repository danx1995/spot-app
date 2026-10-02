import { appConfig } from '../config';
import { ensureGuestSession, resetGuestSession } from './cloudSync';

async function patchShared(collectionID: string, token: string) {
  return await fetch(
    `${appConfig.apiBaseUrl}/api/v1/me/collections/${encodeURIComponent(collectionID)}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ visibility: 'shared' })
    }
  );
}

export async function publishCollection(collectionID: string): Promise<string> {
  const session = await ensureGuestSession();
  let response = await patchShared(collectionID, session.token);

  // Snapshot projection is intentionally asynchronous from the mobile point
  // of view. A single short retry absorbs the rare race after an immediate
  // “create collection → share” action.
  if (response.status === 404) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    response = await patchShared(collectionID, session.token);
  }

  if (response.status === 401) {
    await resetGuestSession();
    throw new Error('session expired');
  }
  if (!response.ok) {
    throw new Error(`collection publish failed with ${response.status}`);
  }

  return `${appConfig.shareBaseUrl}/s/${encodeURIComponent(collectionID)}`;
}
