import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { MeasurementPanel } from '@/features/measure';
import type { Calibration, ModelRef } from '@/integrations/types';
import { deleteModel, getModel, type ModelOrigin, saveModel, type SavedModel, shareModel } from '@/library/store';
import { Button } from '@/ui/Button';
import { useLayout } from '@/ui/layout';
import { C, R } from '@/ui/theme';
import { type ModelDimensions, ModelViewer, type ModelViewerHandle } from '@/viewer/ModelViewer';

type Params = {
  /** file:// of a GLB not yet in the library (fresh generation or import) */
  uri?: string;
  /** id of a model already saved in My Models */
  modelId?: string;
  title?: string;
  origin?: ModelOrigin;
  generationId?: string;
  sourceImage?: string;
};

export default function ExploreScreen() {
  const p = useLocalSearchParams<Params>();
  const L = useLayout();
  const viewer = useRef<ModelViewerHandle>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dims, setDims] = useState<ModelDimensions | null>(null);
  const [spin, setSpin] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<SavedModel | null>(null);
  const [saving, setSaving] = useState(false);
  // Measurements (teammate-owned MeasurementPanel). Calibration lives only while this screen is open.
  const [measurementsOpen, setMeasurementsOpen] = useState(false);
  const [calibration, setCalibration] = useState<Calibration>();
  const [lookup, setLookup] = useState<'none' | 'pending' | 'missing'>(p.modelId ? 'pending' : 'none');

  // Reopen from the on-device library: no network, no regeneration.
  useEffect(() => {
    if (!p.modelId) return;
    let alive = true;
    getModel(p.modelId)
      .then((m) => {
        if (!alive) return;
        if (!m || !m.available) {
          setLookup('missing');
          if (m) setSaved(m);
          return;
        }
        setSaved(m);
        setLookup('none');
      })
      .catch((e) => {
        if (!alive) return;
        setError((e as Error).message);
        setState('error');
      });
    return () => {
      alive = false;
    };
  }, [p.modelId]);

  const modelUri = saved?.available ? saved.glbUri : p.uri;
  const title = saved?.name ?? p.title ?? 'Model';
  const compact = L.width < 560;
  const model = useMemo<ModelRef | null>(
    () =>
      modelUri
        ? { id: saved?.id ?? modelUri, name: title, glbUri: modelUri, modelExtents: dims ?? undefined }
        : null,
    [modelUri, saved?.id, title, dims]
  );
  const sidePanel = L.twoColumn; // landscape / wide: panel beside the model; otherwise full overlay
  const short = L.height < 520;

  const save = () => {
    if (!p.uri || saving) return;
    Alert.prompt(
      'Save to My Models',
      'Give this model a name.',
      async (name) => {
        setSaving(true);
        try {
          let thumb: string | null = null;
          try {
            thumb = await viewer.current?.snapshot() ?? null;
          } catch {} // a missing thumbnail must never block saving
          const m = await saveModel({
            glbUri: p.uri!,
            name: name || title,
            origin: p.origin ?? 'imported',
            generationId: p.generationId || null,
            sourceImageUri: p.sourceImage || null,
            thumbBase64: thumb,
            dims,
          });
          setSaved(m);
        } catch (e) {
          Alert.alert('Couldn’t save', (e as Error).message);
        } finally {
          setSaving(false);
        }
      },
      'plain-text',
      title === 'New model' ? '' : title
    );
  };

  const share = async () => {
    if (!saved) return;
    try {
      await shareModel(saved);
    } catch (e) {
      Alert.alert('Couldn’t share', (e as Error).message);
    }
  };

  if (lookup === 'missing' || (!modelUri && lookup === 'none')) {
    return (
      <View style={[styles.root, styles.center]}>
        <SymbolView name="exclamationmark.triangle.fill" size={28} tintColor={C.warning} />
        <Text style={styles.msgTitle}>{lookup === 'missing' ? 'This model’s file is missing' : 'No model to show'}</Text>
        {lookup === 'missing' ? (
          <Text style={styles.msgBody}>The saved GLB is no longer on this device. You can remove the entry from My Models.</Text>
        ) : null}
        <View style={styles.row}>
          <Button label="Back" onPress={() => router.back()} />
          {lookup === 'missing' && p.modelId ? (
            <Button
              label="Remove entry"
              variant="danger"
              onPress={async () => {
                await deleteModel(p.modelId!).catch(() => {});
                router.back();
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {modelUri ? (
        <ModelViewer
          key={`${modelUri}#${attempt}`}
          ref={viewer}
          modelUri={modelUri}
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
      ) : null}

      {/* Top bar */}
      <View
        style={[styles.top, { paddingTop: L.insets.top + 8, paddingLeft: 16 + L.insets.left, paddingRight: 16 + L.insets.right }]}
        pointerEvents="box-none">
        <Glass>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.roundBtn} accessibilityLabel="Close">
            <SymbolView name="xmark" size={16} tintColor={C.text} weight="semibold" />
          </Pressable>
        </Glass>
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.eyebrow}>{saved ? 'MY MODELS' : 'EXPLORE'}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {saved ? (
          <Glass>
            <Pressable onPress={share} hitSlop={8} style={styles.roundBtn} accessibilityLabel="Share model file">
              <SymbolView name="square.and.arrow.up" size={16} tintColor={C.text} weight="semibold" />
            </Pressable>
          </Glass>
        ) : (
          <View style={{ width: 44 }} />
        )}
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
        <Animated.View
          entering={FadeIn.delay(300).duration(500)}
          style={[styles.bottom, { paddingBottom: L.insets.bottom + (short ? 10 : 20), paddingLeft: L.insets.left, paddingRight: L.insets.right }]}
          pointerEvents="box-none">
          {dims ? (
            <Glass style={styles.dims}>
              <Text style={styles.dimsLabel}>MODEL EXTENTS</Text>
              <Text style={styles.dimsValue}>
                {fmt(dims.x)} × {fmt(dims.y)} × {fmt(dims.z)}
              </Text>
              {!short ? <Text style={styles.dimsNote}>model units · not calibrated to real-world size</Text> : null}
            </Glass>
          ) : null}
          <Glass style={styles.toolbar}>
            <ToolButton icon="scope" label="Reset view" compact={compact} onPress={() => viewer.current?.resetView()} />
            <View style={styles.sep} />
            <ToolButton
              icon={spin ? 'pause.fill' : 'arrow.triangle.2.circlepath'}
              label={spin ? 'Stop spin' : 'Auto-rotate'}
              compact={compact}
              active={spin}
              onPress={() => {
                viewer.current?.setAutoRotate(!spin);
                setSpin(!spin);
              }}
            />
            <View style={styles.sep} />
            <ToolButton icon="ruler" label="Measure" compact={compact} active={measurementsOpen} onPress={() => setMeasurementsOpen(true)} />
            {p.uri || saved ? <View style={styles.sep} /> : null}
            {saved ? (
              <ToolButton icon="checkmark.circle.fill" label="Saved" compact={compact} active onPress={() => router.navigate('/library')} />
            ) : p.uri ? (
              <ToolButton icon={saving ? 'hourglass' : 'tray.and.arrow.down'} label={saving ? 'Saving…' : 'Save'} compact={compact} onPress={save} />
            ) : null}
          </Glass>
          {!short ? <Text style={styles.hint}>Drag to rotate · pinch to zoom · two fingers to pan</Text> : null}
        </Animated.View>
      ) : null}

      {measurementsOpen && model ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[
            styles.measurementsOverlay,
            sidePanel
              ? { top: 0, bottom: 0, right: 0, width: Math.min(480, L.width * 0.45), paddingRight: 18 + L.insets.right }
              : { top: 0, bottom: 0, left: 0, right: 0, paddingLeft: 18 + L.insets.left, paddingRight: 18 + L.insets.right },
            { paddingTop: L.insets.top + 12, paddingBottom: L.insets.bottom + 12 },
          ]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.measurementsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.measurementsEyebrow}>MODEL SIZE · ESTIMATES</Text>
                <Text style={styles.measurementsTitle} numberOfLines={1}>
                  {model.name}
                </Text>
              </View>
              <Pressable
                onPress={() => setMeasurementsOpen(false)}
                style={styles.measurementsClose}
                accessibilityRole="button"
                accessibilityLabel="Close measurements">
                <SymbolView name="xmark" size={15} tintColor={C.text} weight="semibold" />
              </Pressable>
            </View>
            <View style={styles.measurementsBody}>
              <MeasurementPanel model={model} calibration={calibration} onCalibrated={setCalibration} />
            </View>
            <Text style={styles.measurementsNote}>
              Estimates scale the model uniformly from one known length; they are not verified measurements. Calibration is not
              saved yet and resets when you close this model.
            </Text>
          </KeyboardAvoidingView>
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

function ToolButton({
  icon,
  label,
  onPress,
  active,
  compact,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={label}>
      <SymbolView name={icon} size={18} tintColor={active ? C.accent : C.text} />
      {!compact ? <Text style={[styles.toolLabel, active && { color: C.accent }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
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
  measurementsOverlay: {
    position: 'absolute',
    zIndex: 10,
    backgroundColor: C.bg,
    paddingLeft: 18,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: C.hairlineStrong,
  },
  measurementsHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  measurementsEyebrow: { color: C.accent, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  measurementsTitle: { color: C.text, fontSize: 17, fontWeight: '600', marginTop: 2 },
  measurementsClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairlineStrong,
  },
  measurementsBody: { flex: 1, overflow: 'hidden', borderRadius: R.lg },
  measurementsNote: { color: C.textTertiary, fontSize: 11, lineHeight: 15, marginTop: 8 },
});
