import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ServerStatus } from '@/lib/useServerStatus';
import { C, R } from './theme';

export function ServerPill({ status, onPress }: { status: ServerStatus; onPress: () => void }) {
  const { color, label } = describe(status);
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.pill} accessibilityRole="button" accessibilityLabel={`Server status: ${label}. Open server settings.`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function describe(s: ServerStatus): { color: string; label: string } {
  switch (s.kind) {
    case 'checking':
      return { color: C.textTertiary, label: 'Checking server…' };
    case 'online':
      return { color: C.accent, label: `Server connected · ${host(s.url)}` };
    case 'offline':
      return { color: C.danger, label: `Server unreachable · ${host(s.url)}` };
    case 'unset':
      return { color: C.warning, label: 'Set up server' };
    case 'invalid':
      return { color: C.warning, label: 'Server address needs fixing' };
  }
}

const host = (url: string) => url.replace(/^https?:\/\//, '');

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: R.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    maxWidth: 360,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
});
