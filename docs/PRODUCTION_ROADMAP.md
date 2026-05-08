# Production Roadmap

## Phase 0: Foundation Hardening (Current)

- Stabilize offline region metadata contracts.
- Replace linear search and linear snap bottlenecks.
- Keep deterministic routing/search fallback paths active.
- Ship Melange bridge contracts on Android and iOS.

Exit criteria:
- Offline boot works with staged region assets.
- Search and route pipelines operate without network.

## Phase 1: Data Pipeline and Pack Format

- Build region pack manifest schema:
  - map pack version
  - graph version
  - index version
  - checksum signatures
- Add incremental delta format for updates.
- Add resumable downloader with integrity verification.

Exit criteria:
- Regional packs can be installed, resumed, and validated offline.

## Phase 2: Navigation Engine Upgrade

- Replace demo graph with production graph extraction pipeline from OSM.
- Integrate GraphHopper or Valhalla route core.
- Add reroute debounce and route confidence metadata.
- Add constrained vehicle profiles (car first, truck/EV next).

Exit criteria:
- Production-grade routing on full-region datasets.

## Phase 3: Search Engine Upgrade

- Add Rust search module (Tantivy-backed) for multilingual retrieval.
- Build transliteration and Hinglish-aware token pipeline.
- Add typo tolerance and phonetic rank boosting.
- Add query profiling and on-device benchmark harness.

Exit criteria:
- P95 local query latency below 100 ms on target devices.

## Phase 4: Melange Runtime Integration

- Integrate actual Melange model initialization in native plugins.
- Add quantized model bundles and provisioning flow.
- Add semantic reranking and voice command parsing.
- Add AI confidence threshold with deterministic fallback.

Exit criteria:
- AI-assisted navigation intent works fully on-device.

## Phase 5: Native Android Productization

- Build Kotlin + Jetpack Compose shell.
- Integrate MapLibre Native rendering.
- Add Android Auto and Automotive OS compatibility layer.
- Implement lifecycle-safe background services.

Exit criteria:
- Native Android app reaches functional parity with transitional runtime.

## Phase 6: Scale and Operations

- Rollout-safe pack update channels.
- Device-tier feature gating.
- Memory and thermal profiling automation.
- Crash analytics and offline diagnostics upload.

Exit criteria:
- Global region rollout plan ready for millions of users.
