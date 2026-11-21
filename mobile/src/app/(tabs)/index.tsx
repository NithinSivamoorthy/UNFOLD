import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isBusy, type PickedImage, useGeneration } from '@/lib/useGeneration';
import { useServerStatus } from '@/lib/useServerStatus';
import { Button } from '@/ui/Button';
import { GenerationStatus } from '@/ui/GenerationStatus';
import { ServerPill } from '@/ui/ServerPill';
import { ServerSettings } from '@/ui/ServerSettings';
import { C, R } from '@/ui/theme';

export default function CaptureScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 820 && width > height * 0.9;
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
        params: { uri: phase.modelUri, title: 'New model', generationId: phase.id, sourceImage: image?.uri ?? '' },
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
      router.push({ pathname: '/explore', params: { uri: dest.uri, title: picked.name.replace(/\.glb$/i, '') } });
    } catch (e) {
      Alert.alert('Couldn’t open file', (e as Error).message);
    }
  };

  const hero = (
    <Animated.View entering={FadeInDown.duration(600)} style={styles.hero}>
      <Text style={styles.eyebrow}>CAPTURE</Text>
      <Text style={[styles.headline, !wide && styles.headlineCompact]}>
        Turn a picture into something you can turn over in your hands.
      </Text>
      <Text style={styles.sub}>
        Photograph a lab object, scan a textbook diagram on your laptop, or pick an image from Photos. UNFOLD’s AI builds a real
        3D model from it.
      </Text>
      <View style={styles.sources}>
        <Button label="Take photo" icon="camera.fill" size="lg" onPress={() => pick('camera')} disabled={busy} style={styles.flexBtn} />
        <Button
          label="Choose from Photos"
          icon="photo.on.rectangle"
          size="lg"
          onPress={() => pick('library')}
          disabled={busy}
          style={styles.flexBtn}
        />
      </View>
      <Button label="Open a .glb file" icon="doc.badge.plus" variant="ghost" onPress={openGlb} disabled={busy} style={styles.alignStart} />
    </Animated.View>
  );

  const stage = (
    <View style={[styles.stage, wide ? styles.stageWide : { aspectRatio: 4 / 5 }]}>
      {image ? (
        <Animated.View key={image.uri} entering={FadeIn.duration(500)} exiting={FadeOut} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          <LinearGradient colors={['transparent', 'rgba(7,9,11,0.92)']} style={styles.stageShade} />
          {!busy ? (
            <Pressable style={styles.clear} onPress={() => setImage(null)} accessibilityLabel="Remove image" hitSlop={10}>
              <SymbolView name="xmark" size={14} tintColor={C.text} weight="bold" />
            </Pressable>
          ) : null}
        </Animated.View>
      ) : (
        <View style={styles.empty}>
          <ScanFrame />
          <Text style={styles.emptyTitle}>No image yet</Text>
          <Text style={styles.emptyBody}>Single objects on a plain background give the best models.</Text>
        </View>
      )}

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
            <Animated.View entering={FadeIn} style={{ gap: 16 }}>
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
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.wordmark}>UNFOLD</Text>
        <View style={styles.topRight}>
          <ServerPill status={server} onPress={() => setSettingsOpen(true)} />
          <Pressable onPress={() => setSettingsOpen(true)} hitSlop={12} accessibilityLabel="Server settings" style={styles.iconBtn}>
            <SymbolView name="gearshape" size={20} tintColor={C.textSecondary} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, wide && styles.scrollWide, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>
        {wide ? (
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

function ScanFrame() {
  const corner = (pos: object) => <View style={[styles.corner, pos]} />;
  return (
    <View style={styles.frame}>
      {corner({ top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 14 })}
      {corner({ top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 14 })}
      {corner({ bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 14 })}
      {corner({ bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 14 })}
      <SymbolView name="cube.transparent" size={44} tintColor={C.accent} weight="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, height: 56 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  wordmark: { color: C.text, fontSize: 15, fontWeight: '800', letterSpacing: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  scroll: { paddingHorizontal: 20, paddingTop: 12 },
  scrollWide: { paddingHorizontal: 48, paddingTop: 24, flexGrow: 1 },
  columns: { flexDirection: 'row', gap: 48, alignItems: 'stretch', flex: 1 },
  colLeft: { flex: 5, justifyContent: 'center' },
  colRight: { flex: 6 },
  hero: { gap: 20 },
  eyebrow: { color: C.accent, fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  headline: { color: C.text, fontSize: 44, lineHeight: 50, fontWeight: '700', letterSpacing: -1 },
  headlineCompact: { fontSize: 32, lineHeight: 38 },
  sub: { color: C.textSecondary, fontSize: 17, lineHeight: 25, maxWidth: 520 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  flexBtn: { flexGrow: 1 },
  alignStart: { alignSelf: 'flex-start' },
  stage: {
    borderRadius: R.xl,
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairlineStrong,
    justifyContent: 'flex-end',
  },
  stageWide: { flex: 1, minHeight: 520 },
  stageShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  clear: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '600', marginTop: 18 },
  emptyBody: { color: C.textSecondary, fontSize: 15, textAlign: 'center' },
  frame: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: C.accent },
  panel: { padding: 24 },
  error: { gap: 10, backgroundColor: 'rgba(20,10,10,0.85)', borderRadius: R.lg, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,107,107,0.3)' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  errorBody: { color: C.textSecondary, fontSize: 15, lineHeight: 21 },
  errorActions: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
});
