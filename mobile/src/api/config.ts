import Storage from 'expo-sqlite/kv-store';

/**
 * Backend base URL. The iPad must reach the server over LAN or HTTPS — `localhost` on the iPad
 * is the iPad itself. Resolution order: in-app override (Settings) > EXPO_PUBLIC_API_URL.
 * Only a URL lives in the client; provider (Tripo) credentials stay on the server.
 */
const KEY = 'unfold.apiBaseUrl';

export function normalizeBaseUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

export function validateBaseUrl(url: string): string | null {
  if (!url) return 'Enter the backend address, e.g. http://192.168.1.20:8787';
  try {
    const u = new URL(url);
    if (/^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(u.hostname)) {
      return 'localhost points at this device, not your laptop. Use the laptop’s LAN IP or an HTTPS URL.';
    }
  } catch {
    return 'That is not a valid URL.';
  }
  return null;
}

export async function getApiBaseUrl(): Promise<string> {
  const override = await Storage.getItem(KEY).catch(() => null);
  return normalizeBaseUrl(override || process.env.EXPO_PUBLIC_API_URL || '');
}

export async function setApiBaseUrl(url: string | null): Promise<void> {
  if (url) await Storage.setItem(KEY, normalizeBaseUrl(url));
  else await Storage.removeItem(KEY);
}
