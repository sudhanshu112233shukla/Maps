# Melange Automotive Integration

This repository already contains Android and iOS native projects and a registered `MelangeNavigation` Capacitor bridge.

Native plugins now include on-device inference execution paths with deterministic fallback behavior when runtime initialization fails.

## Existing Integration Points

- `src/ai/MelangeNavigation.js`: JS plugin binding
- `src/ai/AIAssistant.js`: Melange-first provider strategy with fallback
- `android/.../MelangeNavigationPlugin.java`: Android plugin with reflective Melange LLM runtime loading
- `ios/.../MelangeNavigationPlugin.swift`: iOS plugin with direct `ZeticMLangeLLMModel` path under `canImport(ZeticMLange)`

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

## Android Status

Completed:
1. Added Melange dependency in `android/app/build.gradle` and fixed direct SDK bindings (`com.zeticai.mlange:mlange:1.6.1`).
2. Added background inference executor in plugin for multi-threading safety.
3. Added real prompt-run-token loop path for intent parsing and chat generation with 10ms-resolution NPU abort timeouts.
4. Added fallback-safe `transcribeNavigationCommand` path with runtime guards and truthful capability reporting.

Remaining:
- Real Whisper speech tensor I/O mapping in `transcribeNavigationCommand`.
- Device validation for speech path with bundled encoder/decoder assets.

## iOS Status

Completed:
1. Added `canImport(ZeticMLange)` runtime path with `ZeticMLangeLLMModel` and `ZeticMLangeModel`.
2. Added `pod 'ZeticMLange'` to `ios/App/Podfile` for standard Xcode dependency synchronization.
3. Added background inference queue with synchronous `Date().timeIntervalSince(startTime)` abort timeouts to prevent UI starvation.
4. Added intent/chat model execution with deterministic offline fallback behavior.
5. Added fallback-safe `transcribeNavigationCommand` path with runtime guards and truthful capability reporting.

Remaining:
- Real Whisper speech tensor I/O mapping in `transcribeNavigationCommand`.
- Device validation for speech path with bundled encoder/decoder assets.

## Production Completion Checklist

1. [x] Replace fallback strings with real model inference outputs.
2. [x] Add strict timeout and fallback handling for every AI call.
3. [x] Add on-device model/version telemetry.
4. [x] Add multilingual evaluation set (English + Hinglish + Hindi).
5. [x] Add battery/thermal benchmarks for sustained navigation sessions.
6. [x] Finalize Android API imports and iOS `Podfile` configuration.
7. [ ] Integrate real Whisper tensor architecture for voice transcriptions.
