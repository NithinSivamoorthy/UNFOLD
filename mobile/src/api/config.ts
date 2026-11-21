import Storage from 'expo-sqlite/kv-store';

import { normalizeBaseUrl } from './url';

export { normalizeBaseUrl, validateBaseUrl } from './url';

/**
 * Backend base URL. The iPad must reach the server over LAN or HTTPS — `localhost` on the iPad
 * is the iPad itself. Resolution order: in-app override (Settings) > EXPO_PUBLIC_API_URL.
 * Only a URL lives in the client; provider (Tripo) credentials stay on the server.
 */
const KEY = 'unfold.apiBaseUrl';

export async function getApiBaseUrl(): Promise<string> {
  const override = await Storage.getItem(KEY).catch(() => null);
  return normalizeBaseUrl(override || process.env.EXPO_PUBLIC_API_URL || '');
}

export async function setApiBaseUrl(url: string | null): Promise<void> {
  if (url) await Storage.setItem(KEY, normalizeBaseUrl(url));
  else await Storage.removeItem(KEY);
}
