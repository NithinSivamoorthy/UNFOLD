import Storage from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';

import { normalizeBaseUrl } from './url';

export { normalizeBaseUrl, validateBaseUrl } from './url';

/**
 * Backend base URL. The iPad must reach the server over LAN or HTTPS — `localhost` on the iPad
 * is the iPad itself. Resolution order: in-app override (Settings) > EXPO_PUBLIC_API_URL.
 * Only a URL lives in the client; provider (Tripo) credentials stay on the server.
 */
const KEY = 'unfold.apiBaseUrl';
const DEMO_TOKEN_KEY = 'unfold.demoAuthorizationToken';

export async function getApiBaseUrl(): Promise<string> {
  const override = await Storage.getItem(KEY).catch(() => null);
  return normalizeBaseUrl(override || process.env.EXPO_PUBLIC_API_URL || '');
}

export async function setApiBaseUrl(url: string | null): Promise<void> {
  if (url) await Storage.setItem(KEY, normalizeBaseUrl(url));
  else await Storage.removeItem(KEY);
}

export async function getDemoAuthToken(): Promise<string> {
  return (await SecureStore.getItemAsync(DEMO_TOKEN_KEY).catch(() => null))?.trim() ?? '';
}

export async function setDemoAuthToken(token: string | null): Promise<void> {
  const value = token?.trim() ?? '';
  if (value) await SecureStore.setItemAsync(DEMO_TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(DEMO_TOKEN_KEY);
}
