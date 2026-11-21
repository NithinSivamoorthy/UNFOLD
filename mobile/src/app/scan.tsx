import { CameraView, useCameraPermissions } from 'expo-camera';
import type { Directory } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { DeviceMotion } from 'expo-sensors';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { isBusy, useGeneration } from '@/lib/useGeneration';
import {
  type CoverageState,
  FAST_RATE_DEG_S,
  initialCoverage,
  integrate,
  isComplete,
  isLikelyBlurry,
  REQUIRED_SECTORS,
  SCAN_TIMEOUT_MS,
  sectorOf,
  STALL_MS,
  wantsCapture,
  yawRateAboutGravity,
} from '@/scan/coverage';
import { deleteQuietly, deleteSession, type Frame, keepFrame, newSession, purgeStaleSessions, storeFrame } from '@/scan/frames';
import { ScanMesh } from '@/scan/ScanMesh';
import { pickByHeading, reindexAfterRemoval, swapSides, type ViewSelection, VIEW_SLOTS, type ViewSlot } from '@/scan/views';
import { Button } from '@/ui/Button';
import { GenerationStatus } from '@/ui/GenerationStatus';
import { clamp, useLayout } from '@/ui/layout';
import { C, R } from '@/ui/theme';

/**
 * Fully automatic guided scan.
 *  - One tap on Start Scan; photos are then taken silently in the background with expo-camera.
 *  - A photo is taken only when the iPad is steady and has turned into a heading sector that has no
 *    photo yet (gyro-based, see coverage.ts). This rejects near-duplicates; a JPEG-size check rejects
 *    likely blurred frames.
 *  - The scan completes when enough distinct heading sectors hold a photo, never because of a timer
 *    or raw photo count. A timeout leads to a recovery screen instead of a false "complete".
 *  - The mesh overlay is illustrative and sits inside a user-adjustable target region.
 */
type Status = 'idle' | 'scanning' | 'complete' | 'stalled' | 'review';
type Region = { fx: number; fy: number; fs: number }; // centre (fractions of viewport) + size (fraction of min side)

const MIN_SHOT_GAP_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ScanScreen() {
  const L = useLayout();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const camReady = useRef(false);
  const session = useRef<Directory | null>(null);
  const framesRef = useRef<Frame[]>([]);
  const cov = useRef<CoverageState>(initialCoverage());
  const motionAbs = useRef(0);
  const lastProgressAt = useRef(0);
  const startedAt = useRef(0);

  const [status, setStatus] = useState<Status>('idle');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [ui, setUi] = useState({ visited: initialCoverage().visited, filled: initialCoverage().filled, fast: false, stalled: false });
  const [notice, setNotice] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>({ fx: 0.5, fy: 0.44, fs: 0.62 });
  const [selection, setSelection] = useState<ViewSelection>({ front: null, left: null, back: null, right: null });
  const [activeSlot, setActiveSlot] = useState<ViewSlot>('front');
  const { phase, start, cancel, reset } = useGeneration();
  const genBusy = isBusy(phase);
  const sourceRef = useRef('');

  // ---- target region gestures (drag to move, pinch to resize) — idle only ----
  const regionRef = useRef(region);
  const statusRef = useRef(status);
  const viewRef = useRef({ w: L.width, h: L.height });
  useEffect(() => {
    regionRef.current = region;
    statusRef.current = status;
    viewRef.current = { w: L.width, h: L.height };
  });
  const [pan] = useState(() => {
    let startRegion: Region = { fx: 0.5, fy: 0.44, fs: 0.62 };
    let startDist = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => statusRef.current === 'idle',
      onMoveShouldSetPanResponder: () => statusRef.current === 'idle',
      onPanResponderGrant: () => {
        startRegion = regionRef.current;
        startDist = 0;
      },
      onPanResponderMove: (e, g) => {
        const { w, h } = viewRef.current;
        const t = e.nativeEvent.touches;
        if (t.length >= 2) {
          const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
          if (!startDist) startDist = d;
          setRegion({ ...regionRef.current, fs: clamp(startRegion.fs * (d / startDist), 0.3, 0.9) });
        } else if (!startDist) {
          setRegion({
            ...startRegion,
            fx: clamp(startRegion.fx + g.dx / w, 0.2, 0.8),
            fy: clamp(startRegion.fy + g.dy / h, 0.2, 0.75),
          });
        }
      },
    });
  });

  // ---- lifecycle ----
  useEffect(() => {
    purgeStaleSessions();
    return () => deleteSession(session.current);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && statusRef.current === 'scanning') {
        setNotice('Scan stopped because UNFOLD left the screen.');
        setStatus('stalled');
      }
    });
    return () => sub.remove();
  }, []);

  // ---- motion: heading integration + steadiness (scanning only) ----
  useEffect(() => {
    if (status !== 'scanning') return;
    let lastTs = 0;
    DeviceMotion.setUpdateInterval(50);
    const sub = DeviceMotion.addListener((m) => {
      const r = m.rotationRate;
      if (!r || !m.accelerationIncludingGravity || !m.acceleration) return;
      const gravity = {
        x: m.accelerationIncludingGravity.x - m.acceleration.x,
        y: m.accelerationIncludingGravity.y - m.acceleration.y,
        z: m.accelerationIncludingGravity.z - m.acceleration.z,
      };
      motionAbs.current = Math.hypot(r.alpha, r.beta, r.gamma);
      const ts = m.rotation?.timestamp ?? 0;
      if (lastTs && ts > lastTs) cov.current = integrate(cov.current, yawRateAboutGravity(gravity, r), ts - lastTs);
      lastTs = ts;
    });
    // Throttled UI snapshot (5 Hz) so the mesh and hints update smoothly without re-rendering at 20 Hz.
    const tick = setInterval(() => {
      const now = Date.now();
      setUi({
        visited: cov.current.visited,
        filled: cov.current.filled,
        fast: motionAbs.current > FAST_RATE_DEG_S,
        stalled: now - lastProgressAt.current > STALL_MS,
      });
    }, 200);
    return () => {
      sub.remove();
      clearInterval(tick);
    };
  }, [status]);

  // ---- silent capture loop ----
  useEffect(() => {
    if (status !== 'scanning') return;
    let stopped = false;
    let failures = 0;
    let lastShot = 0;
    (async () => {
      while (!stopped) {
        await sleep(150);
        if (stopped) break;
        if (Date.now() - startedAt.current > SCAN_TIMEOUT_MS) {
          setNotice(null);
          setStatus('stalled');
          break;
        }
        if (!camReady.current || !cam.current || !session.current) continue;
        if (Date.now() - lastShot < MIN_SHOT_GAP_MS) continue;
        if (!wantsCapture(cov.current, motionAbs.current, framesRef.current.length)) continue;
        const heading = cov.current.headingDeg;
        const sector = sectorOf(heading);
        lastShot = Date.now();
        try {
          const pic = await cam.current.takePictureAsync({ quality: 0.7, exif: false, shutterSound: false });
          if (stopped) {
            deleteQuietly(pic.uri);
            break;
          }
          const f = await storeFrame(session.current, framesRef.current.length, pic, heading);
          if (isLikelyBlurry(f.sizeBytes, framesRef.current.map((x) => x.sizeBytes))) {
            deleteQuietly(f.uri); // try again for this sector when the iPad is steadier
            continue;
          }
          failures = 0;
          framesRef.current = [...framesRef.current, f];
          setFrames(framesRef.current);
          const filled = [...cov.current.filled];
          filled[sector] = true;
          cov.current = { ...cov.current, filled };
          lastProgressAt.current = Date.now();
          if (isComplete(cov.current)) {
            setUi((u) => ({ ...u, filled, visited: cov.current.visited }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setStatus('complete');
            break;
          }
        } catch (e) {
          if (stopped) break;
          if (++failures >= 3) {
            setNotice(`The camera stopped responding (${(e as Error).message}).`);
            setStatus('stalled');
            break;
          }
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [status]);

  // ---- Scan Complete → review ----
  useEffect(() => {
    if (status !== 'complete') return;
    const t = setTimeout(() => openReview(), 1900);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (phase.kind === 'succeeded') {
      router.replace({
        pathname: '/explore',
        params: { uri: phase.modelUri, title: 'Scanned model', origin: 'scan', generationId: phase.id, sourceImage: sourceRef.current },
      });
      reset();
    }
  }, [phase, reset]);

  function openReview() {
    setSelection(pickByHeading(framesRef.current.map((f) => f.headingDeg)));
    setActiveSlot('front');
    setStatus('review');
  }

  const startScan = () => {
    if (!camReady.current) {
      setNotice('Camera is still starting…');
      return;
    }
    deleteSession(session.current);
    session.current = newSession();
    framesRef.current = [];
    cov.current = initialCoverage();
    startedAt.current = Date.now();
    lastProgressAt.current = Date.now();
    setFrames([]);
    setUi({ visited: cov.current.visited, filled: cov.current.filled, fast: false, stalled: false });
    setNotice(null);
    setStatus('scanning');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const restart = () => {
    if (status === 'review') camReady.current = false; // camera remounts after review
    reset();
    deleteSession(session.current);
    session.current = null;
    framesRef.current = [];
    cov.current = initialCoverage();
    setFrames([]);
    setUi({ visited: cov.current.visited, filled: cov.current.filled, fast: false, stalled: false });
    setNotice(null);
    setStatus('idle');
  };

  const close = () => {
    if (genBusy) cancel();
    if (frames.length === 0 || status === 'idle') return router.back();
    Alert.alert('Cancel this scan?', `${frames.length} captured photo${frames.length === 1 ? '' : 's'} will be deleted.`, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Cancel scan', style: 'destructive', onPress: () => router.back() },
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
    setActiveSlot(VIEW_SLOTS[(VIEW_SLOTS.indexOf(activeSlot) + 1) % VIEW_SLOTS.length]);
  };

  const quickGenerate = async () => {
    const f = selection.front != null ? frames[selection.front] : undefined;
    if (!f) return;
    try {
      const uri = await keepFrame(f);
      sourceRef.current = uri;
      start({ uri, width: f.width, height: f.height, mimeType: 'image/jpeg', fileName: 'scan-front.jpg' });
    } catch (e) {
      Alert.alert('Couldn’t prepare the photo', (e as Error).message);
    }
  };

  // ================= permission =================
  if (!perm) return <View style={styles.root} />;
  if (!perm.granted) {
    return (
      <View style={[styles.root, styles.center, { padding: 32 }]}>
        <SymbolView name="camera.fill" size={36} tintColor={C.accent} />
        <Text style={styles.h1}>Camera access needed</Text>
        <Text style={[styles.body, { textAlign: 'center' }]}>3D Scan photographs your object automatically as you move around it.</Text>
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

  // ================= review =================
  if (status === 'review') return renderReview();

  // ================= live scanner =================
  const minSide = Math.min(L.width, L.height);
  const size = region.fs * minSide;
  const rw = size;
  const rh = size * 1.08;
  const left = clamp(region.fx * L.width - rw / 2, 8, L.width - rw - 8);
  const top = clamp(region.fy * L.height - rh / 2, L.insets.top + 56, L.height - rh - 160);
  const angles = ui.filled.filter(Boolean).length;
  const scanning = status === 'scanning';
  const hint = !scanning
    ? 'Drag or pinch the frame to fit your object, then tap Start Scan.'
    : ui.fast
      ? 'Move slowly'
      : frames.length === 0
        ? 'Keep object centered'
        : ui.stalled
          ? 'More angles needed: keep moving around the object'
          : 'Move slowly around the object, keeping it centered';

  return (
    <View style={styles.root}>
      <CameraView
        ref={cam}
        style={StyleSheet.absoluteFill}
        facing="back"
        animateShutter={false}
        onCameraReady={() => {
          camReady.current = true;
        }}
      />

      {/* target region + illustrative mesh */}
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        <View style={{ position: 'absolute', left, top, width: rw, height: rh }}>
          <ScanMesh width={rw} height={rh} filled={ui.filled} visited={ui.visited} scanning={scanning} complete={status === 'complete'} />
        </View>
      </View>

      {/* top bar */}
      <View style={[styles.top, { paddingTop: L.insets.top + 8, paddingLeft: 16 + L.insets.left, paddingRight: 16 + L.insets.right }]} pointerEvents="box-none">
        <Pressable onPress={close} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Cancel scan">
          <SymbolView name="xmark" size={15} tintColor={C.text} weight="semibold" />
        </Pressable>
        <View style={styles.chip}>
          {scanning ? <View style={styles.liveDot} /> : null}
          <Text style={styles.chipText}>{scanning ? 'SCANNING' : status === 'complete' ? 'COMPLETE' : '3D SCAN'}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* bottom: hint + single action */}
      {status === 'idle' || scanning ? (
        <View style={[styles.bottom, { paddingBottom: L.insets.bottom + 20, paddingLeft: L.padLeft, paddingRight: L.padRight }]} pointerEvents="box-none">
          <Animated.Text key={hint} entering={FadeIn.duration(250)} style={[styles.hint, ui.fast && scanning && { color: C.warning }]}>
            {hint}
          </Animated.Text>
          {scanning ? (
            <View style={styles.meter}>
              {Array.from({ length: REQUIRED_SECTORS }, (_, i) => (
                <View key={i} style={[styles.meterSeg, i < angles && styles.meterSegOn]} />
              ))}
            </View>
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {status === 'idle' ? (
            <Button label="Start Scan" icon="viewfinder" variant="primary" size="lg" onPress={startScan} style={styles.startBtn} />
          ) : (
            <Text style={styles.caveat}>Progress counts distinct directions the iPad has turned to. It doesn’t verify full 360° coverage.</Text>
          )}
        </View>
      ) : null}

      {/* Scan complete */}
      {status === 'complete' ? (
        <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut} style={[StyleSheet.absoluteFill, styles.center, styles.scrim]} pointerEvents="none">
          <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.doneBadge}>
            <SymbolView name="checkmark" size={34} tintColor="#04201C" weight="bold" />
          </Animated.View>
          <Text style={styles.doneTitle}>Scan complete</Text>
          <Text style={styles.doneBody}>{frames.length} real photos from distinct angles</Text>
        </Animated.View>
      ) : null}

      {/* timeout / recovery */}
      {status === 'stalled' ? (
        <Animated.View entering={FadeIn} style={[StyleSheet.absoluteFill, styles.center, styles.scrim, { padding: 28 }]}>
          <View style={styles.recover}>
            <SymbolView name="arrow.triangle.2.circlepath" size={30} tintColor={C.warning} />
            <Text style={styles.recoverTitle}>{notice ? 'Scan interrupted' : 'More angles needed'}</Text>
            <Text style={styles.body}>
              {notice ??
                `Only ${angles} of ${REQUIRED_SECTORS} directions were captured in ${Math.round(SCAN_TIMEOUT_MS / 60000 * 10) / 10} minutes. Walk slowly around the object, pausing briefly as you go.`}
            </Text>
            <View style={styles.row}>
              <Button label="Scan again" icon="arrow.counterclockwise" variant="primary" onPress={restart} />
              {frames.length >= 4 ? <Button label={`Review ${frames.length} photos`} onPress={openReview} /> : null}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );

  // ================= review (render helper, closes over screen state) =================
  function renderReview() {
    const two = L.twoColumn;
    const innerW = L.width - L.padLeft - L.padRight;
    const slotSize = clamp((two ? innerW * 0.42 : innerW) / 4 - 9, 70, 170);
    const gridW = two ? innerW * 0.55 : innerW;
    const cols = Math.max(3, Math.floor(gridW / 130));
    const tile = (gridW - 8 * (cols - 1)) / cols;

    const slots = (
      <View style={{ gap: 12 }}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Approximate views</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Button label="Auto-pick" variant="ghost" onPress={() => setSelection(pickByHeading(frames.map((f) => f.headingDeg)))} />
            <Button label="Swap L/R" variant="ghost" onPress={() => setSelection(swapSides)} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {VIEW_SLOTS.map((slot) => {
            const idx = selection[slot];
            const f = idx != null ? frames[idx] : undefined;
            return (
              <Pressable
                key={slot}
                onPress={() => setActiveSlot(slot)}
                style={[styles.slot, { width: slotSize, height: slotSize }, slot === activeSlot && styles.slotActive]}
                accessibilityLabel={`${slot} view slot`}>
                {f ? <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <View style={styles.slotLabel}>
                  <Text style={styles.slotLabelText}>≈ {slot.toUpperCase()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>
          Chosen from how far the iPad had turned when each photo was taken. That isn’t its true position, so check them:
          tap a slot, then a photo, to change it.
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
            <Button label="Generate 3D from scan" icon="cube.transparent" variant="primary" size="lg" disabled />
            <Text style={styles.note}>
              Multiview generation is waiting on the backend’s multiview endpoint, which hasn’t been published yet. The four
              views above are what will be sent.
            </Text>
            <Button label="Quick Generate from front view" icon="bolt.fill" onPress={quickGenerate} disabled={selection.front == null} />
            <Text style={styles.note}>Sends only the ≈ front photo to today’s single-image pipeline.</Text>
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
                style={[styles.frame, { width: tile, height: tile }, used && styles.frameUsed]}
                accessibilityLabel={`Photo ${i + 1}, iPad turned about ${Math.round(((f.headingDeg % 360) + 360) % 360)} degrees`}>
                <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={f.uri} />
                <Text style={styles.frameNum}>≈{Math.round(((f.headingDeg % 360) + 360) % 360)}°</Text>
                {used ? (
                  <View style={styles.frameTag}>
                    <Text style={styles.frameTagText}>{used[0].toUpperCase()}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>Long-press a photo to remove it.</Text>
      </View>
    );

    return (
      <Animated.View entering={FadeIn.duration(400)} style={[styles.root, { paddingTop: L.insets.top, backgroundColor: C.bg }]}>
        <View style={[styles.reviewTop, { paddingLeft: L.padLeft, paddingRight: L.padRight }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>3D SCAN · REVIEW</Text>
            <Text style={styles.h1}>{frames.length} views captured</Text>
          </View>
          <Button label="Scan again" icon="arrow.counterclockwise" onPress={restart} disabled={genBusy} />
          <Pressable onPress={close} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close scan">
            <SymbolView name="xmark" size={15} tintColor={C.text} weight="semibold" />
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
      </Animated.View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 8, justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  self: { alignSelf: 'flex-start' },
  h1: { color: C.text, fontSize: 24, fontWeight: '700' },
  body: { color: C.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  eyebrow: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 3 },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  note: { color: C.textTertiary, fontSize: 12, lineHeight: 17 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 32, borderRadius: R.pill, backgroundColor: 'rgba(0,0,0,0.45)' },
  chipText: { color: C.accent, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 14 },
  hint: {
    color: C.text,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 8,
    maxWidth: 560,
  },
  meter: { flexDirection: 'row', gap: 6 },
  meterSeg: { width: 26, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  meterSegOn: { backgroundColor: C.accent },
  notice: { color: C.warning, fontSize: 13, textAlign: 'center' },
  caveat: { color: 'rgba(255,255,255,0.55)', fontSize: 11, textAlign: 'center', maxWidth: 460 },
  startBtn: { minWidth: 260 },
  scrim: { backgroundColor: 'rgba(4,8,10,0.72)' },
  doneBadge: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  doneTitle: { color: C.text, fontSize: 28, fontWeight: '700' },
  doneBody: { color: C.textSecondary, fontSize: 15 },
  recover: { maxWidth: 460, alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: R.lg, padding: 24 },
  recoverTitle: { color: C.text, fontSize: 20, fontWeight: '700' },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
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
