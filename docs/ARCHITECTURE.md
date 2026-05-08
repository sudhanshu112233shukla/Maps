# Offline AI Maps Architecture

## Scope

This document defines the production architecture target for Melange Maps with offline-first behavior, automotive reliability, and on-device AI.

## System Layers

1. `UI Layer`
- Kotlin + Jetpack Compose
- Navigation UI, search UI, voice controls, drive HUD

2. `Map Rendering Engine`
- MapLibre Native
- Vector tile renderer with offline style packs
- Strict frame budget and GPU-friendly layer composition

3. `Navigation Core`
- GraphHopper or Valhalla
- Deterministic route calculation
- Route profiles: fastest, safest, eco, no-toll

4. `Offline Search Engine`
- Rust service with Tantivy-compatible indexing pipeline
- Multilingual normalization, transliteration, typo tolerance, phonetic matching
- Query target latency: < 100 ms on mid-tier device

5. `AI Semantic Layer`
- Zetic Melange SDK
- On-device intent parsing, semantic reranking, voice command parsing
- AI only assists; deterministic routing remains source of truth

6. `Offline Data Layer`
- Regional packs (PMTiles/MBTiles + graph + POI index + metadata)
- Incremental deltas for road/search updates
- Versioned pack manifest with checksums

7. `Storage and Compression Layer`
- RocksDB: fast key/value graph and ranking metadata
- SQLite: structured metadata and user history
- Compressed assets and binary serialization for low IO

## Thread Model

Thread isolation is mandatory:

- `Render Thread`: map rendering and animation only
- `Navigation Thread`: route search and rerouting
- `Search Thread`: query and ranking
- `AI Thread`: Melange inference
- `Background Thread`: pack download, index build, compaction

No blocking operations are allowed on UI/render threads.

## Runtime Contracts

### Route Query Contract

Input:
- origin coordinate
- destination coordinate or place id
- profile (`fastest | safest | eco | no-toll`)
- avoid constraints

Output:
- polyline geometry
- ETA and distance
- turn list
- confidence and data freshness metadata

### Search Query Contract

Input:
- query string
- language hint
- current location
- region id

Output:
- ranked place candidates
- category/intent classification
- matched tokens and confidence score

### AI Intent Contract (Melange)

Input:
- voice or text query
- locale
- user driving context (optional)

Output:
- destination intent
- POI type
- routing mode and avoid constraints
- confidence score

## Reliability Principles

- Deterministic fallback for all AI-assisted features.
- Offline-first operation after region/model provisioning.
- Strict schema versioning for packs and indexes.
- Crash-safe storage writes with atomic manifest updates.

## Migration Path from Current Repo

1. Keep current Capacitor runtime as feature lab.
2. Build native Compose application module.
3. Move routing/search/AI heavy workloads to native workers.
4. Retain current JS app as test harness until native parity is reached.
