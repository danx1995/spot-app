import { appConfig } from '../config';
import { ensureGuestSession, resetGuestSession } from './cloudSync';

export async function publishCollection(collectionID: string): Promise<string> {
  const session = await ensureGuestSession();
  const encodedID = encodeURIComponent(collectionID);

  const response = await fetch(
    `${appConfig.apiBaseUrl}/api/v1/me/collections/${encodedID}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`
      },
      body: JSON.stringify({ visibility: 'shared' })
    }
  );

  if (response.status === 401) {
    await resetGuestSession();
    throw new Error('session expired');
  }
  if (!response.ok) {
    throw new Error(`collection publish failed with ${response.status}`);
  }

  return `${appConfig.shareBaseUrl}/s/${encodedID}`;
}
