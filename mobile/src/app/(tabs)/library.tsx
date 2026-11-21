import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/ui/theme';

// Milestone 3: on-device library (expo-sqlite metadata + GLB files in the document directory).
export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.eyebrow}>MY MODELS</Text>
      <Text style={styles.title}>Your library</Text>
      <View style={styles.empty}>
        <SymbolView name="cube.transparent" size={48} tintColor={C.textTertiary} weight="light" />
        <Text style={styles.emptyTitle}>No saved models yet</Text>
        <Text style={styles.emptyBody}>Models you save from Explore are stored on this device and open offline.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 32 },
  eyebrow: { color: C.accent, fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  title: { color: C.text, fontSize: 34, fontWeight: '700', marginTop: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 80 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyBody: { color: C.textSecondary, fontSize: 15, textAlign: 'center', maxWidth: 380 },
});
