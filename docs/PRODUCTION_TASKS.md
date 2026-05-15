# Production Task Ledger

This ledger tracks the remaining work required to move Melange Maps from the current Capacitor integration runtime toward a production offline-first AI navigation platform.

## Active Engineering Queue

| Priority | Task | Validation |
| --- | --- | --- |
| P0 | Native offline pack lifecycle: staged download, checksum verify, atomic activate, rollback, finalized backup cleanup | `npm run selfcheck:queue`, `npm run build` |
| P0 | Resumable download reliability: queue priority, pause/resume/cancel, chunk retry state, deterministic aborts | `npm run selfcheck:queue` |
| P0 | Offline search correctness: Hinglish/Hindi aliases, typo/fuzzy matching, automotive intent ranking | `npm run selfcheck:search` |
| P0 | Region data integrity: generated OSM graph, POI index, pack manifest checksum coverage | `npm run graph:validate:india` |
| P1 | Native Rust search activation in Android/iOS bundles with JS parity fallback | Rust bridge parity selfcheck |
| P1 | Real Melange model execution for embeddings, ranking, command parsing, and route assistant | Native plugin smoke tests |
| P1 | PMTiles/MBTiles region pack delivery with incremental delta manifests for every released region | Pack manifest selfcheck |
| P1 | Automotive runtime hardening: memory budgets, cold-start tracking, thermal/network guards | Device performance profile |

## Recently Completed

- Pack manifest selfcheck with release gating (`released` regions must have valid manifests and required assets).
- Boot-time recovery for interrupted region transactions with `Retry` and `Clean up` UI actions.
- Routing regression selfcheck for fastest/no-toll/safest behavior and generated graph routability checks.
- Storage budget preflight guard before provisioning required assets.
- Native Melange plugin contract selfcheck for Android/iOS method and capability shape.

## Next Batch

1. Add generated region packs (USA/Japan/UK/South Korea/Russia/Australia) and promote them from `planned` to `released` with manifest checksums.
2. Add Rust search default-activation selfcheck that asserts native path is preferred when native libraries are present.
3. Add native Melange speech-path smoke checks once model tensor I/O wiring lands.
4. Add device-tier performance profile outputs (memory, startup, thermal/network guard events) and thresholds.
