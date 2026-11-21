import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { pingServer } from '@/api/client';
import { getApiBaseUrl, getDemoAuthToken, normalizeBaseUrl, setApiBaseUrl, setDemoAuthToken, validateBaseUrl } from '@/api/config';
import { Button } from './Button';
import { C, R } from './theme';

export function ServerSettings({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setStatus(null);
    Promise.all([getApiBaseUrl(), getDemoAuthToken()]).then(([url, savedToken]) => {
      setValue(url);
      setToken(savedToken);
    });
  };

  const save = async () => {
    const url = normalizeBaseUrl(value);
    const problem = validateBaseUrl(url);
    if (problem) return setStatus({ ok: false, message: problem });
    setBusy(true);
    try {
      await setApiBaseUrl(url);
      await setDemoAuthToken(token);
      setStatus(await pingServer());
    } catch {
      setStatus({ ok: false, message: 'Could not save the server settings securely.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose} onShow={load}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
        <Text style={styles.title}>Generation server</Text>
        <Text style={styles.body}>
          Enter the HTTPS backend root and temporary demo token. The token is stored in iPhone Keychain and sent as an Authorization header. Never enter the Tripo API key here.
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="https://your-api-tunnel.example.com"
          placeholderTextColor={C.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          onSubmitEditing={save}
        />
        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="Temporary demo authorization token"
          placeholderTextColor={C.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
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
