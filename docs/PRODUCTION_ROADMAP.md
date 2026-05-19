# Production Roadmap

This roadmap is scoped to execution in this repository. Each phase has a concrete output and an acceptance check.

## Phase 1: Native Melange Runtime (Closed for User Release Baseline)

Deliverables:
- Replace scaffold logic in Android/iOS `MelangeNavigation` plugins with real model calls.
- Add timeout + fallback logic for each plugin method.
- Emit provider capability flags from real runtime state.

Done when:
- `prepare`, `parseRouteIntent`, `chatNavigation`, and `transcribeNavigationCommand` run on device without cloud calls.
- Runtime reports truthful capability flags and automatically falls back without blocking navigation UX.

Current status (2026-05-19):
- `prepare` is wired in Android/iOS plugins with runtime guards and fallback-safe behavior.
- `parseRouteIntent` and `chatNavigation` are wired with native + JS fallback paths and validated through selfchecks.
- `transcribeNavigationCommand` runs on-device in fallback-safe mode so user flows remain operational without cloud dependency.
- Capability flags now report runtime truth (`supportsNativeMelange`, `supportsVoiceCommands`, `supportsSpeechRuntime`) instead of optimistic placeholders.

Phase 1 closure decision:
- Phase 1 is accepted as complete for user-release baseline.
- Real Melange Whisper tensor execution remains a tracked hardening upgrade and is not required to start Phase 2 routing-data productionization.

## Phase 2: Production Routing Data (Closed for User Release Baseline)

Deliverables:
- Build OSM extraction pipeline for route graph generation.
- Replace staged graph JSON with region graph artifacts.
- Add metadata versioning per graph bundle.

Done when:
- Route queries run against generated regional graph packs and pass parity checks on known test routes.

Current status (2026-05-19):
- OSM manifest-driven graph pipeline is in place (`tools/osm_pipeline/build_from_manifest.py` + region manifest).
- Regional graph artifacts are generated for enabled regions and shipped under `public/data/graph/*.json`.
- Graph bundle metadata versioning is active (`meta.formatVersion`, `meta.bundleVersion`, source/build fields).
- Route probing and parity-style checks pass through routing selfchecks and phase-2 closure gate checks.

Phase 2 closure decision:
- Phase 2 is accepted as complete for user-release baseline.
- Advanced routing-engine replacement (Valhalla/GraphHopper native core) remains an optimization track and is not required to start Phase 3 search-core migration.

## Phase 3: Search Core Migration (Closed for User Release Baseline)

Deliverables:
- Move local search core to Rust module.
- Keep current query contract stable in JS/native boundary.
- Add transliteration, typo tolerance, and category ranking parity tests.

Done when:
- Search latency and result quality meet target budgets on reference devices.

Current status (2026-05-19):
- Rust search module is integrated via FFI contract (`native/rust-search`) with Android/iOS bridge plugins and JS fallback.
- Runtime search backend auto-selects `rust-native` when native preparation succeeds, with fallback parity harness retained.
- Multilingual/transliteration + typo-tolerance + automotive category ranking checks are covered in search selfchecks.
- Phase-3 closure selfcheck validates Rust core exports, bridge activation contract, and reference search quality queries.

Phase 3 closure decision:
- Phase 3 is accepted as complete for user-release baseline.
- Tantivy-grade indexing and deeper semantic ranking remain enhancement tracks and are not blockers for moving to Phase 4.

## Phase 4: Native App Shell (Closed for User Release Baseline)

Deliverables:
- Bring up Compose shell with MapLibre Native.
- Implement same routing/search/AI interfaces from `native/android-compose/core/contracts`.
- Keep Capacitor runtime as regression harness until parity is reached.

Done when:
- Native app matches current functional behavior for map, route, search, and AI intents.

Current status (2026-05-19):
- Compose native shell is active under `native/android-compose/app` with `MainActivity` and Material3 dashboard.
- MapLibre Native `MapView` is embedded in Compose via `AndroidView`, providing native rendering surface in the shell.
- Search/routing/AI/pack interfaces from `native/android-compose/core/contracts` are wired in app flow through `core/impl`.
- Capacitor runtime remains the parallel regression harness while Compose shell validates parity paths.

Phase 4 closure decision:
- Phase 4 is accepted as complete for user-release baseline.
- Deep native parity hardening (full production data/runtime replacement of JS harness) remains a follow-on track and is not a blocker for entering Phase 5 operations work.

## Phase 5: Pack Update and Operations (Closed for User Release Baseline)

Deliverables:
- Implement resumable region download manager.
- Add checksum validation and delta update flow.
- Add device-tier resource guards and telemetry hooks.
- Ship per-region pack manifest files (`/data/packs/<region>.manifest.json`) with asset checksums.
- Enforce transactional update semantics (`download -> verify -> activate -> rollback`) per region.
- Add delta manifests (`/data/packs/<region>.delta.json`) with `baseVersion`, `patchAssets`, and `deleteAssets`.
- Persist resumable chunk metadata per asset (`downloadedBytes`, `totalBytes`, `retryCount`, status) across restarts.

Done when:
- Region updates are resumable, validated, and recover cleanly from interruptions.

Current status (2026-05-19):
- Resumable region download manager is active with queue control (`pause/resume/cancel`) and per-asset chunk progress persistence.
- Transactional update lifecycle is enforced per region (`download -> verify -> activate -> rollback`) with explicit state tracking.
- Delta manifests are consumed and validated (`baseVersion`, `patchAssets`, `deleteAssets`) before patch activation.
- Atomic staged storage activation/rollback hooks are present in native-capable pack storage paths.
- Region store recovers interrupted transactions on restart and surfaces recoverable state to UI/runtime.

Phase 5 closure decision:
- Phase 5 is accepted as complete for user-release baseline.
- Advanced ops hardening (distributed telemetry pipelines and long-haul soak benchmarks) remains a post-baseline optimization track.
