import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLayout } from '@/ui/layout';
import { C, R } from '@/ui/theme';

/**
 * Integration points for teammate-owned modules (see src/integrations/README.md).
 * These cards state plainly that the features aren't connected yet: no simulated physics,
 * invented measurements, or camera-overlay "AR".
 */
const MODULES: { icon: SymbolViewProps['name']; title: string; body: string }[] = [
  {
    icon: 'atom',
    title: 'Physics Lab',
    body: 'Drop, roll and collide your models in simplified, clearly labelled simulations.',
  },
  {
    icon: 'ruler',
    title: 'Measurements',
    body: 'Calibrate a model against a known reference length, then inspect real dimensions.',
  },
  {
    icon: 'arkit',
    title: 'AR Placement',
    body: 'Place a model in your room using native ARKit (stretch goal).',
  },
];

export default function LabScreen() {
  const L = useLayout();
  const cols = L.width >= 900 ? 3 : 1;
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: L.insets.top + 24, paddingBottom: L.insets.bottom + 24, paddingLeft: L.padLeft, paddingRight: L.padRight }}>
      <Text style={styles.eyebrow}>LAB</Text>
      <Text style={styles.title}>Experiment with your models</Text>
      <View style={[styles.grid, { flexDirection: cols > 1 ? 'row' : 'column' }]}>
        {MODULES.map((m) => (
          <View key={m.title} style={[styles.card, cols > 1 && { flex: 1 }]}>
            <View style={styles.iconWrap}>
              <SymbolView name={m.icon} size={26} tintColor={C.accent} />
            </View>
            <Text style={styles.cardTitle}>{m.title}</Text>
            <Text style={styles.cardBody}>{m.body}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Not connected yet</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  eyebrow: { color: C.accent, fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  title: { color: C.text, fontSize: 34, fontWeight: '700', marginTop: 6 },
  grid: { gap: 16, marginTop: 28 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 24, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineStrong },
  iconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.accentGlow, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  cardTitle: { color: C.text, fontSize: 20, fontWeight: '700' },
  cardBody: { color: C.textSecondary, fontSize: 15, lineHeight: 21 },
  badge: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.06)' },
  badgeText: { color: C.textTertiary, fontSize: 12, fontWeight: '600' },
});
