import { CameraView, useCameraPermissions } from 'expo-camera';
import type { Directory } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { DeviceMotion } from 'expo-sensors';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { isBusy, useGeneration } from '@/lib/useGeneration';
import { deleteQuietly, deleteSession, type Frame, keepFrame, newSession, purgeStaleSessions, storeFrame } from '@/scan/frames';
import { ScanReticle } from '@/scan/ScanReticle';
import { autoPickViews, reindexAfterRemoval, swapSides, type ViewSelection, VIEW_SLOTS, type ViewSlot } from '@/scan/views';
import { Button } from '@/ui/Button';
import { GenerationStatus } from '@/ui/GenerationStatus';
import { clamp, useLayout } from '@/ui/layout';
import { C, R } from '@/ui/theme';

/**
 * Continuous guided scan. The camera photographs the object automatically while the user walks slowly
 * around it. Every frame is a real expo-camera photo. Expo Go cannot measure camera pose, so the ring
 * shows *photos captured* (capture guidance), never measured 3D coverage.
 */
const TARGET_FRAMES = 24; // ring is full at this many photos
const MIN_FRAMES = 8; // enough to offer Finish early
const MIN_INTERVAL_MS = 1100; // rate limit between photos
const MAX_ROTATION_DEG_S = 75; // skip photos while the device swings fast (blur)
const MULTIVIEW_ENDPOINT_AVAILABLE = false; // flip only when the backend contract defines it

type Status = 'idle' | 'scanning' | 'paused' | 'review';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function guidance(count: number, tooFast: boolean): string {
  if (tooFast) return 'Slow down: moving too fast for sharp photos.';
  const p = count / TARGET_FRAMES;
  if (count === 0) return 'Face the front of the object, then walk slowly to one side.';
  if (p < 0.25) return 'Keep the object centered and move slowly around it.';
  if (p < 0.5) return 'Keep circling. You’re heading toward the back.';
  if (p < 0.75) return 'Keep going around the far side.';
  return 'Almost back to where you started. Finish the loop.';
}

export default function ScanScreen() {
  const L = useLayout();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const camReady = useRef(false);
  const session = useRef<Directory | null>(null);
  const framesRef = useRef<Frame[]>([]);
  const motion = useRef(0);

  const [status, setStatus] = useState<Status>('idle');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [tooFast, setTooFast] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<ViewSelection>(autoPickViews(0));
  const [activeSlot, setActiveSlot] = useState<ViewSlot>('front');
  const { phase, start, cancel, reset } = useGeneration();
  const genBusy = isBusy(phase);
  const sourceRef = useRef<string>('');

  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));

  // Clean slate on open; delete this session's temp frames when the screen goes away.
  useEffect(() => {
    purgeStaleSessions();
    return () => deleteSession(session.current);
  }, []);

  // Pause automatically when the app leaves the foreground (the camera stops anyway).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') setStatus((cur) => (cur === 'scanning' ? 'paused' : cur));
    });
    return () => sub.remove();
  }, []);

  // Gyro magnitude: used only to skip blurry captures. Not used as position tracking.
  useEffect(() => {
    if (status !== 'scanning') return;
    DeviceMotion.setUpdateInterval(100);
    const sub = DeviceMotion.addListener((m) => {
      const r = m.rotationRate;
      motion.current = r ? Math.hypot(r.alpha, r.beta, r.gamma) : 0;
    });
    return () => sub.remove();
  }, [status]);

  // The rate-limited capture loop.
  useEffect(() => {
    if (status !== 'scanning') return;
    let stopped = false;
    let failures = 0;
    let lastShot = 0;
    (async () => {
      while (!stopped) {
        await sleep(120);
        if (stopped) break;
        if (!camReady.current || !cam.current || !session.current) continue;
        if (Date.now() - lastShot < MIN_INTERVAL_MS) continue;
        const fast = motion.current > MAX_ROTATION_DEG_S;
        setTooFast(fast);
        if (fast) continue;
        try {
          const pic = await cam.current.takePictureAsync({ quality: 0.7, exif: false, shutterSound: false });
          if (stopped) {
            deleteQuietly(pic.uri);
            break;
          }
          flash.set(withSequence(withTiming(0.45, { duration: 40 }), withTiming(0, { duration: 260 })));
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          const f = await storeFrame(session.current, framesRef.current.length, pic);
          framesRef.current = [...framesRef.current, f];
          setFrames(framesRef.current);
          lastShot = Date.now();
          failures = 0;
          if (framesRef.current.length >= TARGET_FRAMES) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            goReview(framesRef.current);
            break;
          }
        } catch (e) {
          if (stopped) break;
          if (++failures >= 3) {
            setNotice(`The camera stopped responding (${(e as Error).message}). Scan paused.`);
            setStatus('paused');
            break;
          }
          lastShot = Date.now();
        }
      }
    })();
    return () => {
      stopped = true;
    };
    // goReview/flash are stable for this screen's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // When generation succeeds, open the real model in Explore.
  useEffect(() => {
    if (phase.kind === 'succeeded') {
      router.replace({
        pathname: '/explore',
        params: { uri: phase.modelUri, title: 'Scanned model', origin: 'scan', generationId: phase.id, sourceImage: sourceRef.current },
      });
      reset();
    }
  }, [phase, reset]);

  function goReview(list: Frame[]) {
    setSelection(autoPickViews(list.length));
    setActiveSlot('front');
    setTooFast(false);
    setStatus('review');
  }

  const startScan = () => {
    if (!camReady.current) {
      setNotice('Camera is still starting. Try again in a moment.');
      return;
    }
    deleteSession(session.current);
    session.current = newSession();
    framesRef.current = [];
    setFrames([]);
    setNotice(null);
    setStatus('scanning');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const discardAndRestart = () => {
    // Leaving review remounts the camera; wait for its onCameraReady before capturing again.
    if (status === 'review') camReady.current = false;
    reset();
    deleteSession(session.current);
    session.current = null;
    framesRef.current = [];
    setFrames([]);
    setNotice(null);
    setStatus('idle');
  };

  const confirmExit = () => {
    if (frames.length === 0 || genBusy) {
      if (genBusy) cancel();
      router.back();
      return;
    }
    Alert.alert('Discard this scan?', `${frames.length} captured photo${frames.length === 1 ? '' : 's'} will be deleted.`, [
      { text: 'Keep scanning', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const removeFrame = (i: number) => {
    const removed = framesRef.current[i];
    framesRef.current = framesRef.current.filter((_, k) => k !== i);
    setFrames(framesRef.current);
    setSelection((s) => reindexAfterRemoval(s, i));
    if (removed) deleteQuietly(removed.uri);
  };

  const assign = (i: number) => {
    setSelection((s) => ({ ...s, [activeSlot]: i }));
    const next = VIEW_SLOTS[(VIEW_SLOTS.indexOf(activeSlot) + 1) % VIEW_SLOTS.length];
    setActiveSlot(next);
  };

  const quickGenerate = async () => {
    const idx = selection.front;
    const f = idx != null ? frames[idx] : undefined;
    if (!f) return;
    try {
      const uri = await keepFrame(f); // survives session cleanup, so Explore can save it as the source image
      sourceRef.current = uri;
      start({ uri, width: f.width, height: f.height, mimeType: 'image/jpeg', fileName: 'scan-front.jpg' });
    } catch (e) {
      Alert.alert('Couldn’t prepare the photo', (e as Error).message);
    }
  };

  // ---------------- permission ----------------
  if (!perm) return <View style={styles.root} />;
  if (!perm.granted) {
    return (
      <View style={[styles.root, styles.center, { padding: 32 }]}>
        <SymbolView name="camera.fill" size={36} tintColor={C.accent} />
        <Text style={styles.h1}>Camera access needed</Text>
        <Text style={[styles.body, { textAlign: 'center' }]}>3D Scan takes a series of real photos as you move around an object.</Text>
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

  // ---------------- review ----------------
  if (status === 'review') {
    const two = L.twoColumn;
    const innerW = L.width - L.padLeft - L.padRight;
    const slotSize = clamp((two ? innerW * 0.42 : innerW) / 4 - 9, 70, 170);
    const frameCols = Math.max(3, Math.floor((two ? innerW * 0.55 : innerW) / 120));
    const frameSize = ((two ? innerW * 0.55 : innerW) - 8 * (frameCols - 1)) / frameCols;

    const slots = (
      <View style={{ gap: 12 }}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Approximate views</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Button label="Auto-pick" variant="ghost" onPress={() => setSelection(autoPickViews(frames.length))} />
            <Button label="Swap L/R" variant="ghost" onPress={() => setSelection(swapSides)} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {VIEW_SLOTS.map((slot) => {
            const idx = selection[slot];
            const f = idx != null ? frames[idx] : undefined;
            const active = slot === activeSlot;
            return (
              <Pressable
                key={slot}
                onPress={() => setActiveSlot(slot)}
                style={[styles.slot, { width: slotSize, height: slotSize }, active && styles.slotActive]}
                accessibilityLabel={`${slot} view slot${active ? ', selected. Tap a photo below to assign it' : ''}`}>
                {f ? <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <View style={styles.slotLabel}>
                  <Text style={styles.slotLabelText}>≈ {slot.toUpperCase()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>
          Picked evenly from your capture sequence. UNFOLD can’t measure where the camera was, so these are approximate. Tap a slot,
          then tap a photo to change it.
        </Text>
      </View>
    );

    const actions = (
      <View style={styles.genCard}>
        {phase.kind === 'failed' ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.errTitle}>Generation failed</Text>
            <Text style={styles.body}>{phase.message}</Text>
            {phase.retryable ? <Button label="Retry" icon="arrow.clockwise" variant="primary" onPress={quickGenerate} style={styles.self} /> : null}
          </View>
        ) : genBusy ? (
          <View style={{ gap: 12 }}>
            <GenerationStatus phase={phase} />
            <Button label="Cancel" variant="ghost" onPress={cancel} style={styles.self} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Button label="Generate multiview 3D" icon="cube.transparent" variant="primary" size="lg" disabled={!MULTIVIEW_ENDPOINT_AVAILABLE} />
            <Text style={styles.note}>
              Multiview generation is waiting on the backend’s multiview endpoint, which hasn’t been published yet. Your
              selected views are ready for it.
            </Text>
            <Button
              label="Quick Generate from front view"
              icon="bolt.fill"
              onPress={quickGenerate}
              disabled={selection.front == null}
            />
            <Text style={styles.note}>Quick Generate sends only the ≈ front photo to today’s single-image pipeline.</Text>
          </View>
        )}
      </View>
    );

    const grid = (
      <View style={{ gap: 10 }}>
        <Text style={styles.sectionTitle}>Captured photos · {frames.length}</Text>
        <View style={styles.frameGrid}>
          {frames.map((f, i) => {
            const used = VIEW_SLOTS.find((s) => selection[s] === i);
            return (
              <Pressable
                key={f.uri}
                onPress={() => assign(i)}
                onLongPress={() =>
                  Alert.alert('Remove this photo?', undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeFrame(i) },
                  ])
                }
                style={[styles.frame, { width: frameSize, height: frameSize }, used && styles.frameUsed]}
                accessibilityLabel={`Photo ${i + 1}${used ? `, used as ${used}` : ''}. Tap to assign to ${activeSlot}. Long press to remove.`}>
                <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={f.uri} />
                <Text style={styles.frameNum}>{i + 1}</Text>
                {used ? (
                  <View style={styles.frameTag}>
                    <Text style={styles.frameTagText}>{used[0].toUpperCase()}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>Long-press a photo to remove a blurry one.</Text>
      </View>
    );

    return (
      <View style={[styles.root, { paddingTop: L.insets.top, backgroundColor: C.bg }]}>
        <View style={[styles.reviewTop, { paddingLeft: L.padLeft, paddingRight: L.padRight }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>3D SCAN · REVIEW</Text>
            <Text style={styles.h1}>{frames.length} real photos captured</Text>
          </View>
          <Button label="Rescan" icon="arrow.counterclockwise" onPress={discardAndRestart} disabled={genBusy} />
          <Pressable onPress={confirmExit} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close scan">
            <SymbolView name="xmark" size={16} tintColor={C.text} weight="semibold" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingLeft: L.padLeft, paddingRight: L.padRight, paddingBottom: L.insets.bottom + 24, paddingTop: 8 }}>
          {two ? (
            <View style={{ flexDirection: 'row', gap: 28, alignItems: 'flex-start' }}>
              <View style={{ flex: 55 }}>{grid}</View>
              <View style={{ flex: 45, gap: 20 }}>
                {slots}
                {actions}
              </View>
            </View>
          ) : (
            <View style={{ gap: 24 }}>
              {slots}
              {actions}
              {grid}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ---------------- live camera (idle / scanning / paused) ----------------
  const side = L.landscape;
  const railW = side ? clamp(L.width * 0.28, 260, 360) : 0;
  const viewW = L.width - railW;
  const controlsH = side ? 0 : 230 + L.insets.bottom;
  const viewH = L.height - controlsH;
  const reticle = clamp(Math.min(viewW, viewH - L.insets.top - 60) * 0.72, 180, 520);
  const count = frames.length;
  const scanning = status === 'scanning';

  const controls = (
    <View style={{ gap: 14 }}>
      <Animated.Text key={`${status}-${Math.min(4, Math.floor((count / TARGET_FRAMES) * 4))}-${tooFast}`} entering={FadeIn} style={[styles.prompt, tooFast && { color: C.warning }]}>
        {status === 'idle' ? 'Place the object somewhere it won’t move, with space to walk around it.' : status === 'paused' ? 'Scan paused.' : guidance(count, tooFast)}
      </Animated.Text>
      {notice ? <Text style={[styles.note, { color: C.warning }]}>{notice}</Text> : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, (count / TARGET_FRAMES) * 100)}%` }]} />
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.count}>
          {count} photo{count === 1 ? '' : 's'}
          {count > 0 ? ` of ${TARGET_FRAMES}` : ''}
        </Text>
        <Text style={styles.noteSmall}>Ring = photos taken, not measured coverage</Text>
      </View>
      {status === 'idle' ? (
        <Button label="Start Scan" icon="viewfinder" variant="primary" size="lg" onPress={startScan} />
      ) : (
        <View style={[styles.row, { marginTop: 0 }]}>
          {scanning ? (
            <Button label="Pause" icon="pause.fill" onPress={() => setStatus('paused')} style={styles.grow} />
          ) : (
            <Button label="Resume" icon="play.fill" variant="primary" onPress={() => { setNotice(null); setStatus('scanning'); }} style={styles.grow} />
          )}
          <Button label="Finish" icon="checkmark" onPress={() => goReview(framesRef.current)} disabled={count < MIN_FRAMES} style={styles.grow} />
          <Button label="Cancel" variant="danger" onPress={discardAndRestart} />
        </View>
      )}
      {status !== 'idle' && count < MIN_FRAMES ? <Text style={styles.noteSmall}>Finish unlocks after {MIN_FRAMES} photos.</Text> : null}
    </View>
  );

  return (
    <View style={[styles.root, { flexDirection: side ? 'row' : 'column' }]}>
      <View style={{ width: viewW, height: viewH, overflow: 'hidden' }}>
        <CameraView
          ref={cam}
          style={StyleSheet.absoluteFill}
          facing="back"
          animateShutter={false}
          onCameraReady={() => {
            camReady.current = true;
          }}
        />
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ScanReticle size={reticle} progress={count / TARGET_FRAMES} scanning={scanning} captures={count} />
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />
        <View style={[styles.camTop, { paddingTop: L.insets.top + 8, paddingLeft: 16 + L.insets.left, paddingRight: 16 }]}>
          <Pressable onPress={confirmExit} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close scan">
            <SymbolView name="xmark" size={16} tintColor={C.text} weight="semibold" />
          </Pressable>
          <View style={styles.chip}>
            {scanning ? <View style={styles.recDot} /> : null}
            <Text style={styles.chipText}>{scanning ? 'SCANNING' : status === 'paused' ? 'PAUSED' : '3D SCAN'}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{count}</Text>
          </View>
        </View>
      </View>
      <View
        style={[
          styles.controls,
          side
            ? { width: railW, justifyContent: 'center', paddingTop: L.insets.top + 16, paddingBottom: L.insets.bottom + 16, paddingRight: 20 + L.insets.right }
            : { height: controlsH, paddingBottom: L.insets.bottom + 12, paddingLeft: 20 + L.insets.left, paddingRight: 20 + L.insets.right },
        ]}>
        {controls}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  grow: { flexGrow: 1 },
  self: { alignSelf: 'flex-start' },
  h1: { color: C.text, fontSize: 24, fontWeight: '700' },
  body: { color: C.textSecondary, fontSize: 15, lineHeight: 21 },
  eyebrow: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 3 },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  note: { color: C.textTertiary, fontSize: 12, lineHeight: 17 },
  noteSmall: { color: C.textTertiary, fontSize: 11 },
  flash: { backgroundColor: '#E6FFFB' },
  camTop: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 34, borderRadius: R.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  chipText: { color: C.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1.5, fontVariant: ['tabular-nums'] },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
  controls: { backgroundColor: C.surface, padding: 20, justifyContent: 'flex-start' },
  prompt: { color: C.text, fontSize: 18, fontWeight: '600', lineHeight: 24 },
  progressTrack: { height: 4, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.accent },
  count: { color: C.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, backgroundColor: C.bg },
  slot: { borderRadius: R.md, overflow: 'hidden', backgroundColor: C.elevated, borderWidth: 2, borderColor: C.hairlineStrong },
  slotActive: { borderColor: C.accent },
  slotLabel: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.65)' },
  slotLabelText: { color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  frameGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  frame: { borderRadius: 10, overflow: 'hidden', backgroundColor: C.elevated, borderWidth: 1.5, borderColor: 'transparent' },
  frameUsed: { borderColor: C.accent },
  frameNum: { position: 'absolute', top: 4, left: 6, color: '#fff', fontSize: 11, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 3 },
  frameTag: { position: 'absolute', right: 4, bottom: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  frameTagText: { color: '#04201C', fontSize: 11, fontWeight: '800' },
  genCard: { backgroundColor: C.surface, borderRadius: R.lg, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineStrong },
  errTitle: { color: C.danger, fontSize: 17, fontWeight: '700' },
});
