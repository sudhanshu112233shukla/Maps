# Production Roadmap

This roadmap is scoped to execution in this repository. Each phase has a concrete output and an acceptance check.

## Phase 1: Native Melange Runtime

Deliverables:
- Replace scaffold logic in Android/iOS `MelangeNavigation` plugins with real model calls.
- Add timeout + fallback logic for each plugin method.
- Emit provider capability flags from real runtime state.

Done when:
- `prepare`, `parseRouteIntent`, `chatNavigation`, and `transcribeNavigationCommand` run on device without cloud calls.

## Phase 2: Production Routing Data

Deliverables:
- Build OSM extraction pipeline for route graph generation.
- Replace staged graph JSON with region graph artifacts.
- Add metadata versioning per graph bundle.

Done when:
- Route queries run against generated regional graph packs and pass parity checks on known test routes.

## Phase 3: Search Core Migration

Deliverables:
- Move local search core to Rust module.
- Keep current query contract stable in JS/native boundary.
- Add transliteration, typo tolerance, and category ranking parity tests.

Done when:
- Search latency and result quality meet target budgets on reference devices.

## Phase 4: Native App Shell

Deliverables:
- Bring up Compose shell with MapLibre Native.
- Implement same routing/search/AI interfaces from `native/android-compose/core/contracts`.
- Keep Capacitor runtime as regression harness until parity is reached.

Done when:
- Native app matches current functional behavior for map, route, search, and AI intents.

## Phase 5: Pack Update and Operations

Deliverables:
- Implement resumable region download manager.
- Add checksum validation and delta update flow.
- Add device-tier resource guards and telemetry hooks.
- Ship per-region pack manifest files (`/data/packs/<region>.manifest.json`) with asset checksums.
- Enforce transactional update semantics (`download -> verify -> activate -> rollback`) per region.

Done when:
- Region updates are resumable, validated, and recover cleanly from interruptions.
