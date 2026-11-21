import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { GenPhase } from '@/lib/useGeneration';
import { C, R } from './theme';

const STEPS = ['Upload', 'Queued', 'Generating', 'Download'] as const;

function stepIndex(p: GenPhase): number {
  switch (p.kind) {
    case 'uploading':
      return 0;
    case 'queued':
      return 1;
    case 'processing':
      return 2;
    case 'downloading':
      return 3;
    case 'succeeded':
      return 4;
    default:
      return -1;
  }
}

const COPY: Partial<Record<GenPhase['kind'], string>> = {
  uploading: 'Sending your image to the UNFOLD server…',
  queued: 'Queued with the 3D generation engine…',
  processing: 'Building geometry and textures from your image…',
  downloading: 'Downloading your 3D model…',
  succeeded: 'Your model is ready.',
};

export function GenerationStatus({ phase }: { phase: GenPhase }) {
  const idx = stepIndex(phase);
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, false));
  }, [sweep]);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: `${-100 + sweep.get() * 200}%` }] }));

  if (idx < 0) return null;
  const progress = phase.kind === 'processing' ? phase.progress : undefined;

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.steps}>
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <View key={s} style={styles.step}>
              <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                {done ? <SymbolView name="checkmark" size={10} tintColor="#04201C" weight="bold" /> : null}
              </View>
              <Text style={[styles.stepLabel, (done || active) && styles.stepLabelOn]}>{s}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.track}>
        {progress != null ? (
          <View style={[styles.fill, { width: `${Math.max(4, Math.min(100, progress))}%` }]} />
        ) : idx < 4 ? (
          <Animated.View style={[styles.sweep, sweepStyle]} />
        ) : (
          <View style={[styles.fill, { width: '100%' }]} />
        )}
      </View>
      <Text style={styles.copy}>
        {COPY[phase.kind]}
        {progress != null ? `  ${Math.round(progress)}%` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  steps: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', gap: 6, flex: 1 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: C.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { borderColor: C.accent, backgroundColor: C.accentGlow },
  dotDone: { borderColor: C.accent, backgroundColor: C.accent },
  stepLabel: { color: C.textTertiary, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  stepLabelOn: { color: C.text },
  track: { height: 4, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: C.accent, borderRadius: R.pill },
  sweep: { height: '100%', width: '50%', backgroundColor: C.accent, opacity: 0.8, borderRadius: R.pill },
  copy: { color: C.textSecondary, fontSize: 14 },
});
