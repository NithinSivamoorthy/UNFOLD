import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhysicsLabDemo } from '@/features/physics';
import { C, R } from '@/ui/theme';

/**
 * Feature launchers for teammate-owned modules (see src/integrations/README.md).
 * AR remains unavailable until the app can provide genuine device tracking.
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 3 : 1;
  const [physicsOpen, setPhysicsOpen] = useState(false);

  if (physicsOpen) {
    return (
      <View style={[styles.physicsRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <PhysicsLabDemo onExit={() => setPhysicsOpen(false)} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 100, paddingHorizontal: 32 }}>
      <Text style={styles.eyebrow}>LAB</Text>
      <Text style={styles.title}>Experiment with your models</Text>
      <View style={[styles.grid, { flexDirection: cols > 1 ? 'row' : 'column' }]}>
        {MODULES.map((m) => {
          const available = m.title === 'Physics Lab';
          const status = available ? 'Open demo' : m.title === 'Measurements' ? 'Available in Explore' : 'Needs native ARKit';
          return (
            <Pressable
              key={m.title}
              accessibilityRole={available ? 'button' : undefined}
              accessibilityLabel={available ? 'Open Physics Lab demo' : m.title}
              disabled={!available}
              onPress={() => setPhysicsOpen(true)}
              style={[styles.card, cols > 1 && { flex: 1 }, available && styles.cardAvailable]}>
              <View style={styles.iconWrap}>
                <SymbolView name={m.icon} size={26} tintColor={C.accent} />
              </View>
              <Text style={styles.cardTitle}>{m.title}</Text>
              <Text style={styles.cardBody}>{m.body}</Text>
              <View style={[styles.badge, available && styles.badgeAvailable]}>
                <Text style={[styles.badgeText, available && styles.badgeTextAvailable]}>{status}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  physicsRoot: { flex: 1, backgroundColor: C.bg },
  eyebrow: { color: C.accent, fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  title: { color: C.text, fontSize: 34, fontWeight: '700', marginTop: 6 },
  grid: { gap: 16, marginTop: 28 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 24, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineStrong },
  cardAvailable: { borderColor: 'rgba(94,234,212,0.32)' },
  iconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.accentGlow, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  cardTitle: { color: C.text, fontSize: 20, fontWeight: '700' },
  cardBody: { color: C.textSecondary, fontSize: 15, lineHeight: 21 },
  badge: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.06)' },
  badgeAvailable: { backgroundColor: C.accentGlow },
  badgeText: { color: C.textTertiary, fontSize: 12, fontWeight: '600' },
  badgeTextAvailable: { color: C.accent },
});
