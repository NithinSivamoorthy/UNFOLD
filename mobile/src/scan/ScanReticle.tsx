import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { C } from '@/ui/theme';

const TICKS = 48;

/**
 * Capture-guidance reticle. Ticks fill with the number of photos taken (`progress`) — they do NOT
 * represent measured angular coverage, which Expo Go can't provide.
 */
export function ScanReticle({ size, progress, scanning, captures }: { size: number; progress: number; scanning: boolean; captures: number }) {
  const spin = useSharedValue(0);
  const orbit = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(spin);
    spin.set(0);
    spin.set(withRepeat(withTiming(1, { duration: scanning ? 1800 : 4200, easing: Easing.linear }), -1, false));
    orbit.set(withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false));
  }, [scanning, spin, orbit]);

  useEffect(() => {
    if (captures > 0) pulse.set(withSequence(withTiming(1.04, { duration: 90 }), withTiming(1, { duration: 260 })));
  }, [captures, pulse]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 360}deg` }] }));
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbit.get() * 360}deg` }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));

  const filled = Math.round(Math.min(1, progress) * TICKS);
  const r = size / 2;

  return (
    <Animated.View style={[{ width: size, height: size }, pulseStyle]}>
      {/* outer ring */}
      <View style={[styles.ring, { width: size, height: size, borderRadius: r }]} />

      {/* progress ticks */}
      {Array.from({ length: TICKS }, (_, i) => (
        <View
          key={i}
          style={[
            styles.tick,
            {
              left: r - 1.5,
              top: r - 7,
              backgroundColor: i < filled ? C.accent : 'rgba(255,255,255,0.28)',
              transform: [{ rotate: `${(i / TICKS) * 360}deg` }, { translateY: -(r - 14) }],
            },
          ]}
        />
      ))}

      {/* rotating sweep */}
      <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
        <LinearGradient
          colors={['rgba(94,234,212,0.0)', 'rgba(94,234,212,0.85)']}
          style={{ position: 'absolute', left: r - 1, top: 18, width: 2, height: r - 18 }}
        />
      </Animated.View>

      {/* wireframe orbits */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, orbitStyle]}>
        <View style={[styles.wire, { width: size * 0.7, height: size * 0.24, borderRadius: size }]} />
        <View style={[styles.wire, { position: 'absolute', width: size * 0.24, height: size * 0.7, borderRadius: size }]} />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={[styles.wire, { width: size * 0.52, height: size * 0.52, borderRadius: size }]} />
        <View style={styles.crossH} />
        <View style={styles.crossV} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(94,234,212,0.45)' },
  tick: { position: 'absolute', width: 3, height: 14, borderRadius: 1.5 },
  wire: { borderWidth: 1, borderColor: 'rgba(94,234,212,0.28)' },
  crossH: { position: 'absolute', width: 22, height: 1.5, backgroundColor: C.accent },
  crossV: { position: 'absolute', width: 1.5, height: 22, backgroundColor: C.accent },
});
