import { File } from 'expo-file-system';
import { type ComponentType, forwardRef, type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { MODEL_VIEWER_LIB } from './model-viewer-lib.generated';
import { buildViewerHtml } from './viewer-html';

export type ModelDimensions = { x: number; y: number; z: number };

export type ModelViewerHandle = {
  resetView(): void;
  setAutoRotate(on: boolean): void;
  /** JPEG render of the current view, base64 without the data: prefix. */
  snapshot(): Promise<string>;
};

type Props = {
  /** Local file URI (file://…) of a real GLB on the device. */
  modelUri: string;
  onLoaded?: (dims: ModelDimensions) => void;
  onProgress?: (p: number) => void;
  onError?: (message: string) => void;
};

// The package's generic typings declare a plain FunctionComponent; the iOS implementation is a
// forwardRef exposing these imperative methods.
type WebViewHandle = { injectJavaScript(js: string): void; reload(): void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

const CHUNK = 512 * 1024; // base64 chars per injection (multiple of 4)

/**
 * Native-app GLB viewer: WKWebView + bundled <model-viewer> (three.js PBR renderer).
 * Runs in Expo Go (react-native-webview is included) and fully offline. The GLB bytes are
 * read from local storage and streamed into the page in chunks, then loaded from a Blob URL —
 * this avoids WKWebView's file:// fetch restrictions.
 */
export const ModelViewer = forwardRef<ModelViewerHandle, Props>(function ModelViewer(
  { modelUri, onLoaded, onProgress, onError },
  ref
) {
  const web = useRef<WebViewHandle>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => buildViewerHtml(MODEL_VIEWER_LIB), []);
  const cbs = useRef({ onLoaded, onProgress, onError });
  cbs.current = { onLoaded, onProgress, onError };
  const pendingSnaps = useRef(new Map<string, { resolve: (b64: string) => void; reject: (e: Error) => void }>());
  const { width, height } = useWindowDimensions();

  useImperativeHandle(ref, () => ({
    resetView: () => web.current?.injectJavaScript('window.unfold && unfold.reset(); true;'),
    setAutoRotate: (on) => web.current?.injectJavaScript(`window.unfold && unfold.setAutoRotate(${on}); true;`),
    snapshot: () =>
      new Promise<string>((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);
        pendingSnaps.current.set(id, { resolve, reject });
        web.current?.injectJavaScript(`window.unfold && unfold.snapshot('${id}'); true;`);
        setTimeout(() => {
          if (pendingSnaps.current.delete(id)) reject(new Error('Snapshot timed out'));
        }, 5000);
      }),
  }));

  // Belt and braces for rotation: WKWebView normally fires `resize` itself, but nudge the page after
  // RN reports new window dimensions so the renderer and framing always match the new aspect ratio.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => web.current?.injectJavaScript('window.unfold && unfold.relayout(); true;'), 350);
    return () => clearTimeout(t);
  }, [width, height, ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const file = new File(modelUri);
        if (!file.exists) throw new Error('Model file is missing from device storage.');
        const b64 = await file.base64();
        if (cancelled) return;
        const id = Date.now().toString(36);
        const w = web.current;
        if (!w) return;
        w.injectJavaScript(`unfold.begin('${id}'); true;`);
        for (let i = 0; i < b64.length; i += CHUNK) {
          if (cancelled) return;
          w.injectJavaScript(`unfold.chunk('${id}','${b64.slice(i, i + CHUNK)}'); true;`);
          // Yield so the bridge isn't flooded with one giant synchronous burst.
          await new Promise((r) => setTimeout(r, 0));
        }
        w.injectJavaScript(`unfold.end('${id}','model/gltf-binary'); true;`);
      } catch (e) {
        cbs.current.onError?.((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, modelUri]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: { type: string; [k: string]: unknown };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'progress') cbs.current.onProgress?.(Number(msg.loaded) || 0);
    else if (msg.type === 'loaded') cbs.current.onLoaded?.(msg.dimensions as ModelDimensions);
    else if (msg.type === 'error') cbs.current.onError?.(String(msg.message));
    else if (msg.type === 'snapshot') {
      const p = pendingSnaps.current.get(String(msg.reqId));
      if (!p) return;
      pendingSnaps.current.delete(String(msg.reqId));
      const data = typeof msg.data === 'string' ? msg.data : '';
      if (data.startsWith('data:image/jpeg;base64,')) p.resolve(data.slice('data:image/jpeg;base64,'.length));
      else p.reject(new Error(String(msg.error ?? 'Snapshot failed')));
    }
  }, []);

  return (
    <View style={styles.fill}>
      <WebView
        ref={web}
        source={{ html, baseUrl: '' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        style={styles.web}
        containerStyle={styles.fill}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        onContentProcessDidTerminate={() => {
          // iOS can kill the WebGL process under memory pressure; reload and re-stream the model.
          setReady(false);
          web.current?.reload();
        }}
        onError={(e) => cbs.current.onError?.(e.nativeEvent.description)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  web: { flex: 1, backgroundColor: 'transparent' },
});
