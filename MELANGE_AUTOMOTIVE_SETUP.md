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
1. Added Melange dependency in `android/app/build.gradle`.
2. Added background inference executor in plugin.
3. Added real prompt-run-token loop path for intent parsing and chat generation.

Remaining:
1. Replace reflective class probing with fixed SDK API binding after final SDK version lock.
2. Implement speech tensor I/O path for `transcribeNavigationCommand`.

## iOS Status

Completed:
1. Added `canImport(ZeticMLange)` runtime path with `ZeticMLangeLLMModel`.
2. Added background inference queue.
3. Added intent/chat model execution with fallback behavior.

Remaining:
1. Add Swift package in Xcode and verify on physical devices.
2. Implement speech tensor I/O path for `transcribeNavigationCommand`.

## Production Completion Checklist

1. Replace fallback strings with real model inference outputs.
2. Add strict timeout and fallback handling for every AI call.
3. Add on-device model/version telemetry.
4. Add multilingual evaluation set (English + Hinglish + Hindi).
5. Add battery/thermal benchmarks for sustained navigation sessions.
