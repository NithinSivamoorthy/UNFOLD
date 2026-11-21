import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { pingServer } from '@/api/client';
import { getApiBaseUrl, validateBaseUrl } from '@/api/config';

export type ServerStatus =
  | { kind: 'checking' }
  | { kind: 'unset' | 'invalid'; message: string }
  | { kind: 'online'; url: string }
  | { kind: 'offline'; url: string; message: string };

/** Real reachability probe of the configured backend, refreshed whenever the screen gains focus. */
export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus>({ kind: 'checking' });

  const refresh = useCallback(async () => {
    setStatus({ kind: 'checking' });
    const url = await getApiBaseUrl();
    const problem = validateBaseUrl(url);
    if (problem) return setStatus({ kind: url ? 'invalid' : 'unset', message: problem });
    const res = await pingServer();
    setStatus(res.ok ? { kind: 'online', url } : { kind: 'offline', url, message: res.message });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { status, refresh };
}
