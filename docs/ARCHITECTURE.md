# Architecture

## Context

The long-term target stack is native (`Kotlin + Compose + MapLibre Native`), but this repo currently runs a Capacitor runtime used to iterate quickly on offline routing/search/AI contracts.

This document tracks the architecture decisions that are already enforced in code and what is planned next.

## Current Runtime (Implemented)

### UI and Map

- Web UI runs in Capacitor shell.
- Map rendering uses MapLibre GL JS.
- Basemap source config can switch at runtime (network tiles vs local PMTiles URL path).

### Routing

- `AStarRouter` is the active local router.
- Node snap uses spatial grid indexing (not linear scan).
- Route scoring is deterministic and profile-based (`fastest/safest/eco/no-toll`).

### Search

- `Geocoder` is backed by `OfflineSearchIndex`.
- Index supports:
  - token matching
  - prefix matching
  - simple phonetic matching
  - fuzzy matching (Damerau-Levenshtein, bounded)
  - query normalization for Hinglish/Hindi variants

### AI

- `AIAssistant` is Melange-first.
- Native plugins expose a stable contract but currently return scaffolded logic.
- Deterministic fallback remains available if native AI is unavailable.

### Offline Data

- Region metadata is persisted through `OfflineRegionStore`.
- Graph and POI assets are loaded per region and cached by `OfflineDataLoader`.

## Threading and Work Separation (Target)

The native build must maintain strict separation:

- Render thread: map and animation
- Navigation thread: route/reroute work
- Search thread: query/index work
- AI thread: model inference
- Background thread: download/update/index compaction

## Planned Native Modules

- `native/android-compose/core/contracts/*`: stable interfaces for map/search/routing/AI/data.
- `native/rust-search/`: local search core skeleton for future JNI/FFI integration.

## Non-Negotiable Constraints

- No cloud dependency for core navigation behavior.
- AI cannot silently override deterministic safety constraints.
- All pack/index formats must be versioned.
- Background updates must be resumable and integrity-checked.
