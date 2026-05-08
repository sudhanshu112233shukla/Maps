# Melange Automotive Integration Plan

This repo is now structured so the web app can hand off AI work to a native Melange bridge once Capacitor Android and iOS platforms are added.

## What is already prepared

- `src/ai/MelangeNavigation.js`
  - Capacitor plugin entry point for a future native `MelangeNavigation` implementation.
- `src/ai/AIAssistant.js`
  - Melange-first AI provider selection.
  - Automotive route-intent parsing.
  - Rule-based offline fallback when native Melange is not attached.
- `src/offline/OfflineRegionStore.js`
  - Persistent region download status and source metadata.
- `src/offline/offlineRegions.js`
  - Region metadata for pack paths, graph paths, and automotive focus.

## Native plugin contract

Implement a Capacitor plugin named `MelangeNavigation` with these methods:

```ts
prepare(options: {
  tokenKey: string;
  llmModelName: string;
  llmVersion: number;
  speechModelName: string;
  speechVersion: number;
  locale: string;
  domain: 'automobile';
}): Promise<void>

parseRouteIntent(options: {
  query: string;
  locale: string;
  vehicleProfile: 'automobile';
}): Promise<{
  destination?: string;
  mode?: 'fastest' | 'safest' | 'eco' | 'no-toll';
  poi?: string;
  language?: string;
  avoid?: string[];
}>

chatNavigation(options: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  locale: string;
  vehicleProfile: 'automobile';
}): Promise<{ text: string }>

transcribeNavigationCommand(options: {
  locale: string;
}): Promise<{ text: string }>
```

## Android Melange notes

Add Melange dependency in the Android app:

```kotlin
implementation("com.zeticai.mlange:mlange:+")
```

Use `ZeticMLangeModel` for intent/chat inference and a Whisper-class Melange speech model for voice commands.

## iOS Melange notes

Add the Swift package:

- `https://github.com/zetic-ai/ZeticMLangeiOS.git`

Use `ZeticMLangeModel` with the same logical plugin surface exposed to JavaScript.

## Remaining work to reach full offline production

1. Add Capacitor native platforms.
2. Implement the `MelangeNavigation` plugin on Android and iOS.
3. Replace the demo graph with a real regional road graph.
4. Add a compatible local PMTiles style or raster pack pipeline.
5. Replace demo POIs with a compact offline search index.
