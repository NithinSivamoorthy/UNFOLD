# UNFOLD — iOS app (Expo SDK 58 · React Native · TypeScript)

Owned by: frontend. Do not edit `../server/` or `../shared/` from here.

## Run on an iPad (Expo Go, no Xcode needed)
1. Install **Expo Go** from the App Store on the iPad. Put the iPad on the same Wi-Fi as the laptop.
2. On the laptop:
   ```bash
   cd mobile
   npm install                      # also inlines the offline 3D viewer bundle (postinstall)
   cp .env.example .env.local       # set EXPO_PUBLIC_API_URL to http://<laptop-LAN-IP>:<server-port>
   npx expo start
   ```
3. Scan the QR code with the iPad Camera app. It opens in Expo Go.
   On restrictive campus Wi-Fi, use `npx expo start --tunnel`.
4. You can also change the backend URL in the app: tap the gear icon on Capture, then **Save & test**.

## Architecture
- `src/app/`: Expo Router screens. Tabs are Capture, My Models, and Lab. Explore is a full-screen modal.
- `src/api/`: the generation API client. `contract.ts` mirrors `shared/contracts.ts` until that file lands.
- `src/viewer/`: the GLB renderer. It runs `@google/model-viewer` (three.js PBR) inside `react-native-webview`,
  inlined at install time so it **works offline**. GLB bytes stream from device storage into a Blob URL.
  - Why: it runs in Expo Go, a dev build isn't possible without Xcode, and it handles embedded PBR textures
    reliably. R3F/expo-gl texture loading in React Native is fragile.
- `src/integrations/`: interfaces for the teammate-owned Physics, Measurements, and AR modules.

## Checks
```bash
npx tsc --noEmit && npx expo lint && npx expo-doctor
npx expo export --platform ios   # compiles the iOS Hermes bundle
```
