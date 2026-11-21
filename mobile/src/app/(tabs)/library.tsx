import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { deleteModel, formatBytes, listModels, renameModel, type SavedModel, shareModel } from '@/library/store';
import { Button } from '@/ui/Button';
import { useLayout } from '@/ui/layout';
import { C, R } from '@/ui/theme';

const GAP = 16;

export default function LibraryScreen() {
  const L = useLayout();
  const [models, setModels] = useState<SavedModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setModels(await listModels());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Column count adapts to the current width, so rotation reflows the grid.
  const innerW = L.width - L.padLeft - L.padRight;
  const minCard = L.tablet ? 230 : 160;
  const cols = Math.max(1, Math.min(5, Math.floor((innerW + GAP) / (minCard + GAP))));
  const cardW = (innerW - GAP * (cols - 1)) / cols;

  const rename = (m: SavedModel) =>
    Alert.prompt(
      'Rename model',
      undefined,
      async (name) => {
        try {
          await renameModel(m.id, name);
          load();
        } catch (e) {
          Alert.alert('Couldn’t rename', (e as Error).message);
        }
      },
      'plain-text',
      m.name
    );

  const remove = (m: SavedModel) =>
    Alert.alert('Delete model?', `“${m.name}” and its file will be permanently removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteModel(m.id);
          } catch (e) {
            Alert.alert('Couldn’t delete', (e as Error).message);
          }
          load();
        },
      },
    ]);

  const share = async (m: SavedModel) => {
    try {
      await shareModel(m);
    } catch (e) {
      Alert.alert('Couldn’t share', (e as Error).message);
    }
  };

  const open = (m: SavedModel) => router.push({ pathname: '/explore', params: { modelId: m.id } });

  const menu = (m: SavedModel) =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: m.name,
        options: ['Open', 'Rename', 'Share / Export .glb', 'Delete', 'Cancel'],
        destructiveButtonIndex: 3,
        cancelButtonIndex: 4,
        disabledButtonIndices: m.available ? [] : [0, 2],
      },
      (i) => {
        if (i === 0) open(m);
        else if (i === 1) rename(m);
        else if (i === 2) share(m);
        else if (i === 3) remove(m);
      }
    );

  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>MY MODELS</Text>
      <Text style={styles.title}>Your library</Text>
      {models && models.length > 0 ? (
        <Text style={styles.sub}>
          {models.length} model{models.length === 1 ? '' : 's'} stored on this device · open offline
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: L.insets.top }]}>
      {error ? (
        <View style={[styles.center, { paddingLeft: L.padLeft, paddingRight: L.padRight }]}>
          {header}
          <SymbolView name="externaldrive.badge.exclamationmark" size={40} tintColor={C.danger} />
          <Text style={styles.emptyTitle}>Couldn’t load your library</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Button label="Try again" icon="arrow.clockwise" onPress={load} />
        </View>
      ) : models === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlatList
          key={`cols-${cols}`}
          data={models}
          numColumns={cols}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={header}
          columnWrapperStyle={cols > 1 ? { gap: GAP } : undefined}
          contentContainerStyle={{ paddingLeft: L.padLeft, paddingRight: L.padRight, paddingBottom: L.insets.bottom + 24, gap: GAP, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <SymbolView name="cube.transparent" size={48} tintColor={C.textTertiary} weight="light" />
              <Text style={styles.emptyTitle}>No saved models yet</Text>
              <Text style={styles.emptyBody}>Open a model in Explore and tap Save. It’s stored on this device and opens offline.</Text>
              <Button label="Go to Capture" icon="camera.viewfinder" onPress={() => router.navigate('/')} />
            </View>
          }
          renderItem={({ item }) => <ModelCard m={item} width={cardW} onPress={() => (item.available ? open(item) : menu(item))} onMenu={() => menu(item)} />}
        />
      )}
    </View>
  );
}

function ModelCard({ m, width, onPress, onMenu }: { m: SavedModel; width: number; onPress: () => void; onMenu: () => void }) {
  const img = m.thumbUri ?? m.sourceUri;
  return (
    <Animated.View entering={FadeIn.duration(300)} style={{ width }}>
      <Pressable
        onPress={onPress}
        onLongPress={onMenu}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`${m.name}. ${m.available ? 'Open model' : 'File missing'}`}>
        <View style={styles.thumb}>
          {img ? (
            <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <SymbolView name="cube.transparent" size={40} tintColor={C.textTertiary} weight="light" />
          )}
          {!m.available ? (
            <View style={styles.missing}>
              <SymbolView name="exclamationmark.triangle.fill" size={12} tintColor={C.warning} />
              <Text style={styles.missingText}>File missing</Text>
            </View>
          ) : null}
          <View style={styles.origin}>
            <Text style={styles.originText}>{m.origin === 'generated' ? 'AI' : m.origin === 'scan' ? 'SCAN' : 'GLB'}</Text>
          </View>
        </View>
        <View style={styles.meta}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.name} numberOfLines={1}>
              {m.name}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {formatBytes(m.sizeBytes)}
            </Text>
            {m.dims ? (
              <Text style={styles.detail} numberOfLines={1}>
                {m.dims.x.toFixed(2)} × {m.dims.y.toFixed(2)} × {m.dims.z.toFixed(2)} units
              </Text>
            ) : null}
          </View>
          <Pressable onPress={onMenu} hitSlop={10} style={styles.more} accessibilityLabel={`More actions for ${m.name}`}>
            <SymbolView name="ellipsis" size={18} tintColor={C.textSecondary} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: 24, paddingBottom: 8, gap: 6 },
  eyebrow: { color: C.accent, fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  title: { color: C.text, fontSize: 34, fontWeight: '700' },
  sub: { color: C.textSecondary, fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyBody: { color: C.textSecondary, fontSize: 15, textAlign: 'center', maxWidth: 380, marginBottom: 8 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineStrong },
  thumb: { aspectRatio: 1, backgroundColor: '#0B1013', alignItems: 'center', justifyContent: 'center' },
  missing: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  missingText: { color: C.warning, fontSize: 11, fontWeight: '700' },
  origin: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  originText: { color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  name: { color: C.text, fontSize: 16, fontWeight: '600' },
  detail: { color: C.textTertiary, fontSize: 12, fontVariant: ['tabular-nums'] },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
});
