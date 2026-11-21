import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { isBusy, type PickedImage, useGeneration } from '@/lib/useGeneration';
import { useServerStatus } from '@/lib/useServerStatus';
import { Button } from '@/ui/Button';
import { GenerationStatus } from '@/ui/GenerationStatus';
import { clamp, useLayout } from '@/ui/layout';
import { ServerPill } from '@/ui/ServerPill';
import { ServerSettings } from '@/ui/ServerSettings';
import { C, R } from '@/ui/theme';

const TOP_BAR = 56;

export default function CaptureScreen() {
  const L = useLayout();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { phase, start, cancel, reset } = useGeneration();
  const busy = isBusy(phase);
  const { status: server, refresh: refreshServer } = useServerStatus();

  // The moment a real model exists on device, unfold into the 3D explorer.
  useEffect(() => {
    if (phase.kind === 'succeeded') {
      router.push({
        pathname: '/explore',
        params: { uri: phase.modelUri, title: 'New model', origin: 'generated', generationId: phase.id, sourceImage: image?.uri ?? '' },
      });
      reset();
    }
  }, [phase, image, reset]);

  const pick = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in Settings to photograph objects.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85, allowsEditing: false, exif: false };
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      reset();
      setImage({ uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType, fileName: a.fileName });
    } catch (e) {
      Alert.alert(source === 'camera' ? 'Camera unavailable' : 'Couldn’t open Photos', (e as Error).message);
    }
  };

  // Open an existing real GLB (e.g. one exported earlier) — also the offline demo fallback.
  const openGlb = async () => {
    try {
      const res = await File.pickFileAsync({ mimeTypes: ['model/gltf-binary', 'application/octet-stream'] });
      if (res.canceled) return;
      const picked = res.result;
      if (!picked.name.toLowerCase().endsWith('.glb')) {
        Alert.alert('Not a GLB file', 'Choose a .glb 3D model file.');
        return;
      }
      const dir = new Directory(Paths.cache, 'imports');
      dir.create({ intermediates: true, idempotent: true });
      const dest = new File(dir, `${Date.now()}-${picked.name}`);
      await picked.copy(dest);
      router.push({ pathname: '/explore', params: { uri: dest.uri, title: picked.name.replace(/\.glb$/i, ''), origin: 'imported' } });
    } catch (e) {
      Alert.alert('Couldn’t open file', (e as Error).message);
    }
  };

  // ---- adaptive sizing (recomputed on every rotation) ----
  const two = L.twoColumn;
  const usableH = L.contentHeight - TOP_BAR;
  const headlineSize = two ? (usableH < 500 ? 28 : usableH < 700 ? 36 : 42) : L.width >= 600 ? 40 : 30;
  const colWidth = two ? (L.width - L.padLeft - L.padRight - 40) * 0.54 : L.width - L.padLeft - L.padRight;
  // Image area leaves room for the action panel beneath it so nothing is clipped in short landscape.
  const imageH = two
    ? clamp(usableH - 190, 200, 640)
    : L.tablet
      ? clamp(colWidth * 0.7, 300, 620)
      : clamp(colWidth, 240, 460);

  const hero = (
    <Animated.View entering={FadeInDown.duration(600)} style={styles.hero}>
      <Text style={styles.eyebrow}>CAPTURE</Text>
      <Text style={[styles.headline, { fontSize: headlineSize, lineHeight: Math.round(headlineSize * 1.15) }]}>
        Turn a picture into something you can turn over in your hands.
      </Text>
      <Text style={styles.sub}>
        Photograph a lab object, scan a textbook diagram on your laptop, or pick an image from Photos. UNFOLD’s AI builds a real
        3D model from it.
      </Text>
      <View style={styles.sources}>
        <Button label="Take photo" icon="camera.fill" size="lg" onPress={() => pick('camera')} disabled={busy} style={styles.flexBtn} />
        <Button label="Choose from Photos" icon="photo.on.rectangle" size="lg" onPress={() => pick('library')} disabled={busy} style={styles.flexBtn} />
      </View>
      <View style={styles.secondaryRow}>
        <Button label="Guided 3D Scan" icon="viewfinder" onPress={() => router.push('/scan')} disabled={busy} />
        <Button label="Open a .glb file" icon="doc.badge.plus" variant="ghost" onPress={openGlb} disabled={busy} />
      </View>
    </Animated.View>
  );

  const stage = (
    <View style={styles.stage}>
      <View style={[styles.imageArea, { height: imageH }]}>
        {image ? (
          <Animated.View key={image.uri} entering={FadeIn.duration(500)} exiting={FadeOut} style={StyleSheet.absoluteFill}>
            <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
            {!busy ? (
              <Pressable style={styles.clear} onPress={() => setImage(null)} accessibilityLabel="Remove image" hitSlop={10}>
                <SymbolView name="xmark" size={14} tintColor={C.text} weight="bold" />
              </Pressable>
            ) : null}
          </Animated.View>
        ) : (
          <View style={styles.empty}>
            <ScanFrame size={imageH < 280 ? 96 : 150} />
            <Text style={styles.emptyTitle}>No image yet</Text>
            <Text style={styles.emptyBody}>Single objects on a plain background give the best models.</Text>
          </View>
        )}
      </View>

      {image ? (
        <View style={styles.panel}>
          {phase.kind === 'failed' ? (
            <Animated.View entering={FadeIn} style={styles.error}>
              <View style={styles.errorRow}>
                <SymbolView name="exclamationmark.triangle.fill" size={18} tintColor={C.danger} />
                <Text style={styles.errorTitle}>Generation failed</Text>
              </View>
              <Text style={styles.errorBody}>{phase.message}</Text>
              <View style={styles.errorActions}>
                {phase.retryable ? <Button label="Retry" icon="arrow.clockwise" variant="primary" onPress={() => start(image)} /> : null}
                <Button label="Server settings" icon="gearshape" onPress={() => setSettingsOpen(true)} />
              </View>
            </Animated.View>
          ) : busy || phase.kind === 'succeeded' ? (
            <Animated.View entering={FadeIn} style={{ gap: 12 }}>
              <GenerationStatus phase={phase} />
              {busy ? <Button label="Cancel" variant="ghost" onPress={cancel} style={styles.alignStart} /> : null}
            </Animated.View>
          ) : (
            <Button label="Generate 3D model" icon="cube.transparent" variant="primary" size="lg" onPress={() => start(image)} />
          )}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: L.insets.top }]}>
      <View style={[styles.topBar, { paddingLeft: L.padLeft, paddingRight: L.padRight }]}>
        <Text style={styles.wordmark}>UNFOLD</Text>
        <View style={styles.topRight}>
          <ServerPill status={server} onPress={() => setSettingsOpen(true)} />
          <Pressable onPress={() => setSettingsOpen(true)} hitSlop={12} accessibilityLabel="Server settings" style={styles.iconBtn}>
            <SymbolView name="gearshape" size={20} tintColor={C.textSecondary} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingLeft: L.padLeft, paddingRight: L.padRight, paddingTop: 8, paddingBottom: L.insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}>
        {two ? (
          <View style={styles.columns}>
            <View style={styles.colLeft}>{hero}</View>
            <View style={styles.colRight}>{stage}</View>
          </View>
        ) : (
          <View style={{ gap: 28 }}>
            {hero}
            {stage}
          </View>
        )}
      </ScrollView>
      <ServerSettings
        visible={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          refreshServer();
        }}
      />
    </View>
  );
}

function ScanFrame({ size }: { size: number }) {
  const r = Math.round(size * 0.09);
  const len = Math.round(size * 0.23);
  const corner = (pos: object) => <View style={[styles.corner, { width: len, height: len }, pos]} />;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {corner({ top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: r })}
      {corner({ top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: r })}
      {corner({ bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: r })}
      {corner({ bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: r })}
      <SymbolView name="cube.transparent" size={Math.round(size * 0.3)} tintColor={C.accent} weight="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: TOP_BAR, gap: 12 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  wordmark: { color: C.text, fontSize: 15, fontWeight: '800', letterSpacing: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  columns: { flexDirection: 'row', gap: 40, alignItems: 'flex-start' },
  colLeft: { flex: 46, paddingTop: 8 },
  colRight: { flex: 54 },
  hero: { gap: 18 },
  eyebrow: { color: C.accent, fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  headline: { color: C.text, fontWeight: '700', letterSpacing: -0.8 },
  sub: { color: C.textSecondary, fontSize: 16, lineHeight: 23, maxWidth: 560 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  flexBtn: { flexGrow: 1, flexBasis: 200 },
  alignStart: { alignSelf: 'flex-start' },
  stage: {
    borderRadius: R.xl,
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairlineStrong,
  },
  imageArea: { width: '100%', backgroundColor: C.surface },
  clear: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '600', marginTop: 12 },
  emptyBody: { color: C.textSecondary, fontSize: 15, textAlign: 'center' },
  corner: { position: 'absolute', borderColor: C.accent },
  panel: { padding: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.hairline },
  error: { gap: 10 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  errorBody: { color: C.textSecondary, fontSize: 15, lineHeight: 21 },
  errorActions: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
});
