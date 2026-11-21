import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { pingServer } from '@/api/client';
import { getApiBaseUrl, normalizeBaseUrl, setApiBaseUrl, validateBaseUrl } from '@/api/config';
import { Button } from './Button';
import { C, R } from './theme';

export function ServerSettings({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setStatus(null);
    getApiBaseUrl().then(setValue);
  };

  const save = async () => {
    const url = normalizeBaseUrl(value);
    const problem = validateBaseUrl(url);
    if (problem) return setStatus({ ok: false, message: problem });
    setBusy(true);
    await setApiBaseUrl(url);
    setStatus(await pingServer());
    setBusy(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose} onShow={load}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
        <Text style={styles.title}>Generation server</Text>
        <Text style={styles.body}>
          The address of the laptop running the UNFOLD server, reachable from this device on the same Wi-Fi
          (e.g. http://192.168.1.20:8787) or an HTTPS tunnel URL.
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="http://192.168.x.x:8787"
          placeholderTextColor={C.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          onSubmitEditing={save}
        />
        {status ? <Text style={[styles.status, { color: status.ok ? C.accent : C.danger }]}>{status.message}</Text> : null}
        <View style={styles.row}>
          <Button label="Done" variant="ghost" onPress={onClose} />
          <Button label="Save & test" icon="antenna.radiowaves.left.and.right" variant="primary" loading={busy} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: C.surface, padding: 28, gap: 16 },
  title: { color: C.text, fontSize: 24, fontWeight: '700' },
  body: { color: C.textSecondary, fontSize: 15, lineHeight: 21 },
  input: {
    color: C.text,
    fontSize: 17,
    borderRadius: R.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairlineStrong,
    backgroundColor: C.elevated,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  status: { fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
});
