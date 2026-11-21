import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { isBusy, type PickedImage, useGeneration } from '@/lib/useGeneration';
import { Button } from '@/ui/Button';
import { GenerationStatus } from '@/ui/GenerationStatus';
import { clamp, useLayout } from '@/ui/layout';
import { C, R } from '@/ui/theme';

/**
 * Guided multi-angle capture. Every image is a real camera photo. The angle names are prompts for
 * the user — UNFOLD does not measure camera pose, so nothing here claims a verified viewpoint.
 */
const ANGLES = [
  { key: 'front', label: 'Front', prompt: 'Face the object straight on and fill the frame.' },
  { key: 'right', label: 'Right', prompt: 'Move a quarter turn around to the object’s right side.' },
  { key: 'back', label: 'Back', prompt: 'Keep circling until you’re looking at the back.' },
  { key: 'left', label: 'Left', prompt: 'One more quarter turn to see the left side.' },
] as const;

type Shots = (PickedImage | null)[];

export default function GuidedScanScreen() {
  const L = useLayout();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [shots, setShots] = useState<Shots>([null, null, null, null]);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'capture' | 'review'>('capture');
  const [shooting, setShooting] = useState(false);
  const { phase, start, cancel, reset } = useGeneration();
  const busy = isBusy(phase);

  useEffect(() => {
    if (phase.kind === 'succeeded') {
      router.replace({
        pathname: '/explore',
        params: { uri: phase.modelUri, title: 'Scanned model', origin: 'scan', generationId: phase.id, sourceImage: shots[0]?.uri ?? '' },
      });
      reset();
    }
  }, [phase, shots, reset]);

  const capture = async () => {
    if (!cam.current || !ready || shooting) return;
    setShooting(true);
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.85, exif: false });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const next: Shots = [...shots];
      next[step] = { uri: pic.uri, width: pic.width, height: pic.height, mimeType: 'image/jpeg', fileName: `${ANGLES[step].key}.jpg` };
      setShots(next);
      const missing = next.findIndex((s, i) => !s && i > step);
      const anyMissing = next.findIndex((s) => !s);
      if (missing >= 0) setStep(missing);
      else if (anyMissing >= 0) setStep(anyMissing);
      else setMode('review');
    } catch (e) {
      Alert.alert('Couldn’t take the photo', (e as Error).message);
    } finally {
      setShooting(false);
    }
  };

  const retake = (i: number) => {
    setStep(i);
    setMode('capture');
  };

  // ---- permission states ----
  if (!perm) return <View style={styles.root} />;
  if (!perm.granted) {
    return (
      <View style={[styles.root, styles.center, { padding: 32 }]}>
        <SymbolView name="camera.fill" size={36} tintColor={C.accent} />
        <Text style={styles.h1}>Camera access needed</Text>
        <Text style={styles.body}>Guided Scan takes four real photos of your object from different sides.</Text>
        <View style={styles.row}>
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
          {perm.canAskAgain ? (
            <Button label="Allow camera" variant="primary" onPress={requestPerm} />
          ) : (
            <Button label="Open Settings" variant="primary" onPress={() => Linking.openSettings()} />
          )}
        </View>
      </View>
    );
  }

  const done = shots.filter(Boolean).length;
  const side = L.landscape; // controls beside the camera in landscape, below it in portrait
  const panelW = side ? clamp(L.width * 0.3, 260, 380) : undefined;

  if (mode === 'review') {
    const cols = L.landscape || L.width >= 700 ? 4 : 2;
    const gap = 12;
    const innerW = L.width - L.padLeft - L.padRight;
    const tile = clamp((innerW - gap * (cols - 1)) / cols, 120, L.landscape ? (L.contentHeight - 260) : 400);
    return (
      <View style={[styles.root, { paddingTop: L.insets.top }]}>
        <ScrollView contentContainerStyle={{ paddingLeft: L.padLeft, paddingRight: L.padRight, paddingBottom: L.insets.bottom + 24, gap: 20 }}>
          <View style={styles.reviewHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>GUIDED SCAN · REVIEW</Text>
              <Text style={styles.h1}>Check your four views</Text>
            </View>
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close scan">
              <SymbolView name="xmark" size={16} tintColor={C.text} weight="semibold" />
            </Pressable>
          </View>
          <View style={[styles.grid, { gap }]}>
            {ANGLES.map((a, i) => (
              <View key={a.key} style={{ width: tile, gap: 8 }}>
                <View style={[styles.reviewTile, { height: tile }]}>
                  {shots[i] ? <Image source={{ uri: shots[i]!.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                  <View style={styles.tileLabel}>
                    <Text style={styles.tileLabelText}>{a.label.toUpperCase()}</Text>
                  </View>
                </View>
                <Button label="Retake" icon="arrow.counterclockwise" onPress={() => retake(i)} disabled={busy} />
              </View>
            ))}
          </View>
          <View style={styles.genCard}>
            {phase.kind === 'failed' ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.errTitle}>Generation failed</Text>
                <Text style={styles.body}>{phase.message}</Text>
                <View style={styles.row}>
                  {phase.retryable ? <Button label="Retry" icon="arrow.clockwise" variant="primary" onPress={() => start(shots[0]!)} /> : null}
                </View>
              </View>
            ) : busy ? (
              <View style={{ gap: 12 }}>
                <GenerationStatus phase={phase} />
                <Button label="Cancel" variant="ghost" onPress={cancel} style={{ alignSelf: 'flex-start' }} />
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Button label="Generate 3D from front view" icon="cube.transparent" variant="primary" size="lg" onPress={() => start(shots[0]!)} />
                <Text style={styles.note}>
                  The UNFOLD server currently builds models from a single image, so only the Front photo is sent. All four views
                  will be used once multi-view generation is supported by the backend.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  const angle = ANGLES[step];
  const camW = side ? L.width - (panelW ?? 0) : L.width;
  const camH = side ? L.height : L.height * 0.62;
  const reticle = Math.min(camW, camH) * 0.62;

  return (
    <View style={[styles.root, { flexDirection: side ? 'row' : 'column' }]}>
      <View style={{ width: camW, height: camH }}>
        <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} animateShutter />
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Reticle size={reticle} />
        </View>
        <View style={[styles.camTop, { paddingTop: L.insets.top + 8, paddingLeft: 16 + L.insets.left, paddingRight: 16 }]}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close scan">
            <SymbolView name="xmark" size={16} tintColor={C.text} weight="semibold" />
          </Pressable>
          <Animated.View key={angle.key} entering={FadeIn.duration(300)} style={styles.promptChip}>
            <Text style={styles.promptStep}>
              {step + 1}/4 · {angle.label.toUpperCase()}
            </Text>
          </Animated.View>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <View
        style={[
          styles.panel,
          side
            ? { width: panelW, paddingTop: L.insets.top + 20, paddingBottom: L.insets.bottom + 20, paddingRight: 20 + L.insets.right }
            : { flex: 1, paddingBottom: L.insets.bottom + 12, paddingLeft: 20 + L.insets.left, paddingRight: 20 + L.insets.right },
        ]}>
        <View style={{ gap: 6 }}>
          <Text style={styles.eyebrow}>GUIDED 3D SCAN</Text>
          <Text style={styles.promptText}>{angle.prompt}</Text>
          <Text style={styles.note}>Angle names are guidance only. UNFOLD doesn’t track where your camera is.</Text>
        </View>

        <View style={styles.progress}>
          {ANGLES.map((a, i) => {
            const shot = shots[i];
            const active = i === step;
            return (
              <Pressable
                key={a.key}
                onPress={() => setStep(i)}
                style={[styles.thumb, active && styles.thumbActive]}
                accessibilityLabel={`${a.label} view${shot ? ', captured. Tap to retake' : ''}`}>
                {shot ? <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <Text style={[styles.thumbLabel, shot && styles.thumbLabelOn]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.shutterRow}>
          <Text style={styles.count}>{done}/4 captured</Text>
          <Pressable
            onPress={capture}
            disabled={!ready || shooting}
            style={({ pressed }) => [styles.shutter, (pressed || shooting) && { transform: [{ scale: 0.94 }] }, !ready && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel={`Capture ${angle.label} view`}>
            <View style={styles.shutterInner} />
          </Pressable>
          {done === 4 ? (
            <Button label="Review" icon="square.grid.2x2" onPress={() => setMode('review')} />
          ) : done > 0 ? (
            <Button label="Review" variant="ghost" onPress={() => setMode('review')} disabled={!shots[0]} />
          ) : (
            <View style={{ width: 90 }} />
          )}
        </View>
      </View>
    </View>
  );
}

/** Framing guide with an animated sweep line (visual feedback only — not a measurement). */
function Reticle({ size }: { size: number }) {
  const t = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true));
    pulse.set(withRepeat(withSequence(withTiming(0.55, { duration: 1100 }), withTiming(1, { duration: 1100 })), -1));
  }, [t, pulse]);
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: t.get() * (size - 4) }] }));
  const glow = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const len = size * 0.18;
  const corner = (pos: object) => <View style={[styles.corner, { width: len, height: len }, pos]} />;
  return (
    <Animated.View style={[{ width: size, height: size }, glow]}>
      {corner({ top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 18 })}
      {corner({ top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 18 })}
      {corner({ bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 18 })}
      {corner({ bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 18 })}
      <Animated.View style={[styles.sweep, line]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 8 },
  h1: { color: C.text, fontSize: 26, fontWeight: '700' },
  body: { color: C.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'left' },
  eyebrow: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 3 },
  note: { color: C.textTertiary, fontSize: 12, lineHeight: 17 },
  camTop: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  promptChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  promptStep: { color: C.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  corner: { position: 'absolute', borderColor: C.accent },
  sweep: { position: 'absolute', left: 8, right: 8, top: 0, height: 2, backgroundColor: C.accent, shadowColor: C.accent, shadowOpacity: 0.9, shadowRadius: 8 },
  panel: { backgroundColor: C.surface, padding: 20, gap: 18, justifyContent: 'space-between' },
  promptText: { color: C.text, fontSize: 18, fontWeight: '600', lineHeight: 24 },
  progress: { flexDirection: 'row', gap: 8 },
  thumb: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: C.elevated,
    borderWidth: 1.5,
    borderColor: C.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  thumbActive: { borderColor: C.accent },
  thumbLabel: { color: C.textTertiary, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  thumbLabelOn: { color: C.text, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  count: { color: C.textSecondary, fontSize: 13, fontWeight: '600', width: 90 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: C.text, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.text },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  reviewTile: { borderRadius: R.md, overflow: 'hidden', backgroundColor: C.elevated },
  tileLabel: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.6)' },
  tileLabelText: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  genCard: { backgroundColor: C.surface, borderRadius: R.lg, padding: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineStrong },
  errTitle: { color: C.danger, fontSize: 17, fontWeight: '700' },
});
