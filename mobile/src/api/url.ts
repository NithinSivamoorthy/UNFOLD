/** Pure helpers (no native imports) so they can be unit-tested under plain Node. */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  // Users often paste the API root; endpoints already include /api.
  url = url.replace(/\/api$/i, '');
  return url;
}

export function validateBaseUrl(url: string): string | null {
  if (!url) return 'No server set. Tap the gear icon and enter the laptop’s address, e.g. http://192.168.1.20:8787';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'That is not a valid URL.';
  }
  if (!/^https?:$/.test(u.protocol)) return 'Use an http:// or https:// address.';
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(u.hostname)) {
    return 'localhost points at this iPad, not your laptop. Use the laptop’s LAN IP (e.g. http://192.168.1.20:8787) or an HTTPS tunnel URL.';
  }
  return null;
}

/** GLB files start with the ASCII magic "glTF" (0x67 0x6C 0x54 0x46). */
export function isGlbHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
}
