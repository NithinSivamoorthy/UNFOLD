# Integration points for teammate-owned modules

**Owner of this folder:** frontend (shell + interfaces only).

| Module | Proposed location (owned by Physics/AR teammate) | Interface |
| --- | --- | --- |
| Measurements and calibration | `mobile/src/features/measure/index.ts` | `MeasurementPanelProps` |
| Physics Lab | `mobile/src/features/physics/index.ts` | `PhysicsLabProps` |
| AR placement | `mobile/src/features/ar/index.ts` | `ARPlacementProps` + `isSupported()` |

The frontend never edits `src/features/*`. Please confirm these locations before you implement.

## Runtime constraints we verified (Expo SDK 58)
- The team has **no Xcode**, so the app runs in **Expo Go** on the iPad. Only native modules bundled in Expo Go are usable.
  Anything else (react-native-filament, ViroReact, a custom ARKit module, Rapier native) needs an EAS
  development build and an Apple Developer account. Raise it early if you need one.
- Usable in Expo Go: `react-native-webview` (WebGL2 via WKWebView), `expo-gl`, `expo-sensors`, `expo-camera`.
- The 3D viewer runs three.js inside a WebView (`src/viewer/`). For physics, the lowest-risk path is the same
  WebView approach with `cannon-es` (pure JS, bundled inline like `scripts/build-viewer-lib.mjs`).
  WASM physics in a WebView also works. Avoid WASM in Hermes.
- Model extents are in **GLB model units**. Never show them as centimetres without a `Calibration`.
- AR: a camera feed with a model drawn over it is **not** AR. Ship it only with real world tracking.
