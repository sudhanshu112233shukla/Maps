# Production Blueprint: Offline-First AI Maps Platform

This document is the execution-grade target architecture for Melange Maps.
It aligns the current repository with a production path for smartphones and automotive systems.

## 1) Architecture Improvements

Target runtime stack:
- Android: `Kotlin + Jetpack Compose + MapLibre Native`
- iOS: native shell with same domain contracts
- Shared high-performance modules: `Rust` (search/index/ranking), optional `C++` only for critical low-level bindings

Layered architecture:
1. UI Layer
2. Map Rendering Engine
3. Navigation + Routing Core
4. Offline Search Engine
5. AI Semantic Layer (Melange)
6. Offline Data Layer
7. Storage + Compression Layer

Concurrency model:
- Render thread: map drawing and gestures
- Navigation thread: route computation/reroute/snap
- Search thread: local retrieval/ranking
- AI thread: Melange inference jobs
- Indexing/update thread: pack ingestion and index rebuild
- Background download thread: resumable pack updates

Hard rule:
- No UI-thread work for routing, search, AI inference, graph/index loading, or pack verification.

## 2) File/Folder Restructuring

Current state:
- Capacitor runtime remains active as regression harness.
- Native direction is scaffolded in `native/android-compose`.

Target structure:
- `native/android-compose/app`: Compose UI and app lifecycle
- `native/android-compose/core/contracts`: engine interfaces (already present)
- `native/android-compose/core/impl/*`: concrete adapters
  - `routing-valhalla` or `routing-graphhopper`
  - `search-rust-ffi`
  - `ai-melange`
  - `pack-manager`
- `native/rust-search`: search/index core and FFI surface
- `tools/osm_pipeline`: region graph generation and validation
- `docs/`: ADR-style architecture, SLOs, and rollout plan

## 3) Recommended Technologies

Required primary choices:
- Rendering: `MapLibre Native`
- Vector maps: `PMTiles` (regional packs), optional `MBTiles` fallback
- Routing: prefer `Valhalla` for multi-modal flexibility and traffic model extensibility; `GraphHopper` acceptable as alternate
- Storage:
  - `SQLite` for metadata/state/catalog
  - `RocksDB` for high-write local caches/index segments
- Search:
  - Rust local engine with Tantivy-style inverted index + trie/prefix structures
  - FFI bindings for Android/iOS
- AI:
  - `ZETIC Melange SDK` for on-device NPU/accelerator inference
  - Quantized ONNX models for intent, rerank, and voice commands

## 4) Performance Optimizations

Rendering:
- Keep style immutable where possible; update data sources incrementally.
- Tile decode and preparation off render thread.
- Predictive viewport prefetch using heading/speed.

Routing:
- Keep graph memory-mapped when possible.
- Hierarchical routing (coarse + local refinement) for large regions.
- Route cache keyed by `(originCell, destinationCell, profile)`.

Search:
- Precomputed transliteration + phonetic keys at index build time.
- Top-K bounded scoring and early-exit.
- Region-scoped shards with memory budget caps.

AI:
- Job queue with inference timeouts and deterministic fallback.
- Batch embeddings/reranking when request burst detected.

## 5) AI Integration Implementation (Melange)

Use Melange for:
- Query intent parsing (`destination`, `poi_type`, `avoid`, `profile`)
- Semantic POI reranking over local lexical candidates
- Offline chat-style navigation assistant
- Voice command parse/transcribe path

Guardrails:
- AI can suggest; deterministic safety policy decides final route profile.
- If AI fails/timeout occurs, fallback to rule-based parser and lexical search.
- Capability flags must reflect real runtime state (`nativeAvailable`, `prepared`, `voiceAvailable`).

## 6) Offline Map Implementation Strategy

Pack format:
- Region PMTiles + region graph JSON/binary + POI/index bundle + manifest metadata

Pack lifecycle:
1. Discover pack version
2. Resume-safe download by chunk
3. Hash verify
4. Atomic swap (no partial activation)
5. Post-activation index warmup

Update model:
- Delta packs where possible
- Full replacement fallback when delta invalid
- Rollback to last known-good pack on verification failure

## 7) Search Engine Implementation

Search pipeline:
1. Normalize/transliterate query (Hindi/Hinglish/regional variants)
2. Candidate generation (token/prefix/trie/phonetic/fuzzy)
3. Lexical scoring
4. Semantic rerank (Melange lightweight model)
5. Region + proximity + category boost

SLO:
- `P95 < 100ms` local query latency on reference 4GB device.

## 8) Automotive Optimization Strategy

Runtime profile:
- Fast startup with minimal warm cache set
- Thermal-aware inference frequency and route recompute throttling
- Strict crash recovery with persisted nav session checkpoints

Automotive readiness:
- Android Auto / Android Automotive integration boundaries
- Driving-safe UI states (reduced interaction complexity while moving)
- EV extensions: charger availability schema and range-aware route constraints

## 9) Scalability Plan (Millions of Users)

Scale model:
- Region-first data distribution
- Compressed per-region packs
- Incremental updates and staged rollout channels
- Telemetry hooks for pack integrity and latency distributions (privacy-preserving)

Operational controls:
- Versioned schemas for graph/index/poi bundles
- Forward/backward compatibility windows
- Build reproducibility for deterministic artifacts

## 10) Concrete Code Improvements (Repository Roadmap)

Immediate:
- Complete Melange native path in Android/iOS plugins with strict timeouts
- Keep JS AI/search fallback for parity and resilience
- Continue Rust search bridge rollout to production binaries
- Expand OSM graph generation by region (already started)

Next:
- Add parity test harness for search/routing outputs between JS and native
- Introduce pack integrity manifest (`sha256`, size, schemaVersion)
- Move Compose shell from contracts to first executable module

## 11) Step-by-Step Implementation Roadmap

Phase A (now):
1. Stabilize contracts and fallback behavior
2. Finish multi-region graph pipeline and validators
3. Ship Rust search libs in mobile bundles

Phase B:
1. Compose native shell with MapLibre Native
2. Routing engine adapter integration
3. On-device semantic reranking path

Phase C:
1. Resumable pack manager + delta updates
2. Automotive profile tuning
3. Perf hardening against budget gates

Phase D:
1. Regional language expansion and index quality loop
2. Large-scale operationalization and release train automation

## 12) Production Engineering Recommendations

- Treat every interface under `core/contracts` as stable API with versioning.
- Gate merges with artifact validation and perf checks for high-risk changes.
- Keep deterministic fallback for all AI-assisted features.
- Enforce bounded caches and memory budgets by device tier.
- Maintain offline-first behavior as a release blocker (not a best effort).

## Current Status Snapshot

Already in repo:
- Multi-region graph pipeline framework and graph validator
- Native Melange plugin path + fallback model
- Rust search bridge path + fallback
- Region pack concept and offline data loaders

Still required for world-class parity:
- Native Compose app shell completion
- Production routing engine adapter
- Full multilingual semantic search index pipeline
- Pack delta updates + robust operations layer
