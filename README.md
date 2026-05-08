# Melange Maps

Melange Maps is an offline-first AI navigation platform for smartphones and automobiles.

The product goal is clear: build production-grade offline navigation infrastructure for low-connectivity regions, with India-first multilingual search and on-device AI through Zetic Melange SDK.

## Mission

- Fully offline map rendering, routing, and place search after provisioning.
- AI-assisted semantic navigation running on device.
- Automotive reliability, low thermal load, and low memory footprint.
- Scalable regional pack architecture for millions of users.

## Current State (This Repository)

This repo currently runs a transitional offline runtime based on:

- `MapLibre GL JS` + `Capacitor` shell
- Local graph and POI boot assets
- Native Melange plugin bridge scaffolds for Android and iOS
- Offline-first routing/search with deterministic fallbacks

Recent upgrades in this repo:

- Indexed multilingual local search (token + prefix + phonetic + fuzzy ranking)
- Faster route node snapping using spatial grid indexing
- PMTiles-aware source configuration path
- Safer map style/source lifecycle updates
- Melange bridge metadata and Hinglish intent improvements

## Target Production Architecture

```
UI Layer (Kotlin + Jetpack Compose)
  -> Map Rendering Engine (MapLibre Native)
  -> Navigation Core (GraphHopper or Valhalla)
  -> Offline Search Core (Rust Tantivy + transliteration/fuzzy ranking)
  -> AI Semantic Layer (Zetic Melange SDK)
  -> Offline Data Services (region packs + delta updates)
  -> Storage Layer (RocksDB + SQLite)
```

Thread isolation target:

- Rendering thread
- Navigation/routing thread
- Search indexing/query thread
- AI inference thread
- Background pack download/update thread

## Stack Direction

Primary production stack:

- `Kotlin` + `Jetpack Compose`
- `MapLibre Native`
- `GraphHopper` or `Valhalla`
- `RocksDB` + `SQLite`
- `Rust` search/indexing engine (Tantivy-backed preferred)
- `Zetic Melange SDK` for on-device AI

Current web stack remains in place as a rapid iteration layer while native modules are phased in.

## Phase Roadmap

1. Stabilize offline data contracts and pack formats.
2. Replace demo routing graph with production graph pipeline.
3. Ship Rust offline search engine module with Hinglish + Hindi normalization.
4. Wire real Melange model execution in native plugins.
5. Launch native Android Compose shell using MapLibre Native.
6. Add Android Auto / Automotive OS compatibility layer.
7. Add regional incremental update pipeline and rollout controls.

## Repository Areas

- `src/`: current offline runtime, routing/search/AI orchestration
- `android/`: native Android shell and Melange bridge scaffold
- `ios/`: native iOS shell and Melange bridge scaffold
- `public/data/`: staged offline graph and POI assets
- `MELANGE_AUTOMOTIVE_SETUP.md`: native Melange integration contract

## Development

```bash
npm install
npm run dev
npm run build
npm run mobile:build
```

Capacitor sync:

```bash
npm run cap:sync
```

## Engineering Principles

- Deterministic core navigation; AI assists but does not override safety rules.
- Offline-first correctness over online convenience.
- Explicit resource budgets for RAM, CPU, battery, and storage.
- Modular architecture with replaceable engines (routing/search/AI/data).
