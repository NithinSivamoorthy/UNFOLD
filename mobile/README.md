# UNFOLD Mobile

UNFOLD turns object photos into interactive 3D models. The iOS app is built with Expo SDK 58, React Native, and TypeScript. Capture and explore are designed for iPhone and iPad; generation uses the protected UNFOLD backend and Tripo image-to-model API.

## Features

- Capture tab with camera photo capture and guided multi-view scan workflow.
- Upload photos from the library and submit supported JPEG/PNG images to the backend.
- Generation status and progress polling, cancellation, and clear failure states.
- Interactive GLB viewing with orbit controls and embedded PBR textures; save generated models locally and revisit them in **My Models**.
- Lab tab with standalone physics and estimated-measurement tools. Explore contains additional app workflows.
- Backend URL and demo bearer-token settings. The URL is stored in app settings; the token is stored in iOS Keychain through Expo SecureStore. Provider API keys remain server-side.

## Run with Expo Go

Install Node.js and Expo Go from the App Store. From the repository root:

```bash
cd mobile
npm install
npx expo start --tunnel
```

Open the QR code with the iPhone Camera app and launch it in Expo Go. Tunnel mode works across networks where local device discovery is blocked. For a LAN connection, use `npx expo start` while both devices share a reachable Wi-Fi network.

## Backend setup

Run the Express server separately (see [`../server/README.md`](../server/README.md)). Configure the API base URL as the backend origin, with no `/api` suffix. A remote phone needs an HTTPS address, such as a private development tunnel. In the app, open the server settings from Capture, enter the backend root URL and the temporary demo bearer token, then choose **Save & test**. Never put a Tripo API key in the app or this repository.

The app stores a URL override in its local settings store and the demo token in secure storage. These can be changed in Settings without rebuilding the app. Generation requests, status polling, and model downloads send the saved token in the `Authorization: Bearer …` header.

## Capture and create

- **Take Photo:** use the camera controls to capture an object image.
- **Upload Image:** select a JPEG or PNG from Photos.
- **Guided 3D Scan:** follow the on-screen capture guidance to collect views. The current backend generation endpoint accepts one image; the scan screen’s **Quick Generate from front view** submits the selected front image. The multi-view generation action is not available until a matching backend endpoint exists.
- **Generate:** explicitly start a real generation after reviewing the request and configured quality/cost. The server enforces authentication and rate limits. Generation may consume provider credits.

## Viewing and saved models

Completed GLB files download to app cache and are checked for the GLB file signature before opening in the interactive viewer. The embedded model-viewer renderer supports orbit/zoom and textured models. Saved models are available in **My Models** according to the app’s local library behavior; cached files may be removed by iOS when storage is reclaimed.

## Implemented tools and limitations

The Lab includes a simple 2D physics/ramp demonstration and approximate measurements; these are standalone tools and measurements are estimates. Guided scan is a photo workflow rather than native depth capture. **Native LiDAR is not available in Expo Go**; it requires native platform support and an appropriate development build. Multi-view backend generation and other integrations are not implied to be implemented just because related UI or interfaces exist.

## Development

Stack: Expo SDK 58, React Native 0.88, TypeScript, Expo Router, Expo Camera, Expo FileSystem, Expo SecureStore, Expo SQLite KV store, and WebView-based model-viewer.

```bash
cd mobile
npm install
npx expo start --tunnel
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

`npm install` runs the postinstall script that prepares the bundled 3D viewer. `.env.local` is optional for a default backend URL during development; local environment files, tokens, caches, generated bundles, and dependencies are excluded from version control.
