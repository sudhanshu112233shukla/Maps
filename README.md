# Melange Maps

Offline-first navigation project focused on weak-connectivity environments and automotive use cases.

This repository currently ships a Capacitor + MapLibre runtime used as an integration and testing base while native modules are being introduced.

## What Works Today

- Offline boot with staged graph and POI data.
- Deterministic region provisioning with asset verification.
- Atomic offline pack activation with rollback and post-activation cleanup.
- Resumable chunk downloads with adaptive chunk sizing, retry backoff, pause/resume/cancel.
- Boot-time recovery of interrupted pack transactions (`download`/`verify`/`activate` -> `interrupted`).
- Local routing with automobile-focused cost modes (`fastest`, `safest`, `eco`, `no-toll`).
- Local search with token, prefix, phonetic, and fuzzy ranking.
- Region release gating so only shipped pack regions are downloadable.
- Native Android/iOS Melange inference path (with deterministic fallback when runtime init fails).
- Rust search bridge path with JS fallback/parity checks.

## What Is Still In Progress

- Real Melange model execution inside native plugins.
- Production OSM-to-routing graph pipeline (current graph assets are staged samples).
- Native Android app shell (`Kotlin + Compose + MapLibre Native`).
- Incremental region update pipeline and pack integrity checks.

## Repository Layout

- `src/`: current runtime (map UI, search, routing, AI orchestration)
- `android/`, `ios/`: Capacitor native shells + plugin scaffolds
- `public/data/`: staged offline graph/POI assets
- `tools/osm_pipeline/`: OSM PBF to routing graph generation pipeline
- `docs/`: architecture, roadmap, performance budgets
- `native/`: native-stack contracts and module skeletons

## Production Blueprint

- `docs/PRODUCTION_BLUEPRINT.md` is the primary target architecture and execution plan for the offline-first AI maps platform.

## Development

```bash
npm install
npm run dev
npm run build
npm run cap:sync
```

## Offline Pack Status

- `india`: `released` (downloadable)
- `usa`, `japan`, `uk`, `skorea`, `russia`, `australia`: `planned` (pack generation pending)

## Validation Commands

Run these before pushing production changes:

```bash
npm run selfcheck:packs
npm run selfcheck:queue
npm run selfcheck:search
npm run selfcheck:routing
npm run graph:validate:india
npm run build
```

## Design Rules Used In This Codebase

- Core navigation logic must remain deterministic and usable without cloud.
- AI can parse intent and assist ranking, but it must not override safety logic.
- Expensive work stays off the UI thread.
- Caches are bounded and explicit.

## Near-Term Milestones

1. Wire Melange runtime calls in Android/iOS plugin implementations.
2. Replace remaining staged regional assets with generated graph/POI/pack outputs.
3. Move search core to Rust module and expose native bindings.
4. Bring up Compose-native shell and run parity tests against current runtime.
