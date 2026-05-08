# Melange Automotive Integration

This repository already contains Android and iOS native projects and a registered `MelangeNavigation` Capacitor bridge.

Current native plugin implementations are scaffolds with deterministic fallbacks. The next step is wiring real Melange model execution.

## Existing Integration Points

- `src/ai/MelangeNavigation.js`: JS plugin binding
- `src/ai/AIAssistant.js`: Melange-first provider strategy with fallback
- `android/.../MelangeNavigationPlugin.java`: Android plugin scaffold
- `ios/.../MelangeNavigationPlugin.swift`: iOS plugin scaffold

## Plugin Contract

```ts
prepare(options: {
  tokenKey: string;
  llmModelName: string;
  llmVersion: number;
  speechModelName: string;
  speechVersion: number;
  locale: string;
  domain: 'automobile';
}): Promise<{
  prepared: boolean;
  runtime: string;
  supportsNativeMelange: boolean;
  supportsVoiceCommands: boolean;
  supportsSemanticSearch?: boolean;
  supportsPredictiveCaching?: boolean;
  threadingModel?: string;
}>

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

## Android Wiring Tasks

1. Add Melange dependency in `android/app/build.gradle`.
2. Initialize models in `prepare` and cache runtime/session handles.
3. Move inference to background executors (never run on UI thread).
4. Implement:
   - intent parsing
   - chat response generation
   - speech transcription

## iOS Wiring Tasks

1. Add `ZeticMLangeiOS` Swift package in Xcode.
2. Initialize Melange models in `prepare`.
3. Use background queues for inference.
4. Implement matching methods and return parity JSON contracts.

## Production Completion Checklist

1. Replace fallback strings with real model inference outputs.
2. Add strict timeout and fallback handling for every AI call.
3. Add on-device model/version telemetry.
4. Add multilingual evaluation set (English + Hinglish + Hindi).
5. Add battery/thermal benchmarks for sustained navigation sessions.
