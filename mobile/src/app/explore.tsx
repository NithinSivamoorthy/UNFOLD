import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/ui/Button';
import { C, R } from '@/ui/theme';
import { type ModelDimensions, ModelViewer, type ModelViewerHandle } from '@/viewer/ModelViewer';

export default function ExploreScreen() {
  const { uri, title } = useLocalSearchParams<{ uri: string; title?: string; generationId?: string; sourceImage?: string }>();
  const insets = useSafeAreaInsets();
  const viewer = useRef<ModelViewerHandle>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dims, setDims] = useState<ModelDimensions | null>(null);
  const [spin, setSpin] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (!uri) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.msgTitle}>No model to show</Text>
        <Button label="Back" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ModelViewer
        key={attempt}
        ref={viewer}
        modelUri={uri}
        onProgress={setProgress}
        onLoaded={(d) => {
          setDims(d);
          setState('ready');
        }}
        onError={(m) => {
          setError(m);
          setState('error');
        }}
      />

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Glass>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.roundBtn} accessibilityLabel="Close">
            <SymbolView name="xmark" size={16} tintColor={C.text} weight="semibold" />
          </Pressable>
        </Glass>
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.eyebrow}>EXPLORE</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title || 'Model'}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Loading / error overlays */}
      {state === 'loading' ? (
        <Animated.View exiting={FadeOut.duration(400)} style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator color={C.accent} size="large" />
          <Text style={styles.loadingText}>Unfolding model… {progress > 0 ? `${Math.round(progress * 100)}%` : ''}</Text>
        </Animated.View>
      ) : null}
      {state === 'error' ? (
        <Animated.View entering={FadeIn} style={[StyleSheet.absoluteFill, styles.center, styles.errorWrap]}>
          <SymbolView name="exclamationmark.triangle.fill" size={28} tintColor={C.danger} />
          <Text style={styles.msgTitle}>Couldn’t display this model</Text>
          <Text style={styles.msgBody}>{error}</Text>
          <Button
            label="Try again"
            icon="arrow.clockwise"
            variant="primary"
            onPress={() => {
              setState('loading');
              setProgress(0);
              setAttempt((a) => a + 1);
            }}
          />
        </Animated.View>
      ) : null}

      {/* Bottom controls */}
      {state === 'ready' ? (
        <Animated.View entering={FadeIn.delay(300).duration(500)} style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
          {dims ? (
            <Glass style={styles.dims}>
              <Text style={styles.dimsLabel}>MODEL EXTENTS</Text>
              <Text style={styles.dimsValue}>
                {fmt(dims.x)} × {fmt(dims.y)} × {fmt(dims.z)}
              </Text>
              <Text style={styles.dimsNote}>model units · not calibrated to real-world size</Text>
            </Glass>
          ) : null}
          <Glass style={styles.toolbar}>
            <ToolButton icon="scope" label="Reset view" onPress={() => viewer.current?.resetView()} />
            <View style={styles.sep} />
            <ToolButton
              icon={spin ? 'pause.fill' : 'arrow.triangle.2.circlepath'}
              label={spin ? 'Stop spin' : 'Auto-rotate'}
              active={spin}
              onPress={() => {
                viewer.current?.setAutoRotate(!spin);
                setSpin(!spin);
              }}
            />
          </Glass>
          <Text style={styles.hint}>Drag to rotate · pinch to zoom · two fingers to pan</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const fmt = (n: number) => (Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2));

function Glass({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <BlurView intensity={40} tint="dark" style={[styles.glass, style]}>
      {children}
    </BlurView>
  );
}

function ToolButton({ icon, label, onPress, active }: { icon: SymbolViewProps['name']; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={label}>
      <SymbolView name={icon} size={18} tintColor={active ? C.accent : C.text} />
      <Text style={[styles.toolLabel, active && { color: C.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  glass: { borderRadius: R.pill, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineStrong, backgroundColor: 'rgba(15,19,23,0.35)' },
  roundBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { alignItems: 'center', flex: 1 },
  eyebrow: { color: C.accent, fontSize: 11, fontWeight: '700', letterSpacing: 3 },
  title: { color: C.text, fontSize: 18, fontWeight: '600', marginTop: 2 },
  loadingText: { color: C.textSecondary, fontSize: 15 },
  errorWrap: { backgroundColor: 'rgba(7,9,11,0.85)' },
  msgTitle: { color: C.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  msgBody: { color: C.textSecondary, fontSize: 15, textAlign: 'center', maxWidth: 480 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 14 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, height: 52 },
  toolLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
  sep: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: C.hairlineStrong },
  dims: { borderRadius: R.lg, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' },
  dimsLabel: { color: C.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  dimsValue: { color: C.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 2 },
  dimsNote: { color: C.textTertiary, fontSize: 11, marginTop: 2 },
  hint: { color: C.textTertiary, fontSize: 12 },
});
