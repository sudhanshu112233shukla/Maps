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

## Current Batch Completed

- Finalize successful pack activations by deleting rollback backups after post-activation verification.
- Clear resumable chunk metadata after successful activation or rollback.
- Add local search regression coverage for Hindi/Hinglish and automotive queries.
- Improve category ranking so queries like `petrol near mumbai` and `nearest ev charger` rank actionable POIs before cities.

## Next Batch

1. Add a pack manifest selfcheck that verifies every released region has a manifest and every required asset exists with a valid checksum.
2. Add download state recovery on app boot so interrupted transactions show a clear `Resume`, `Retry`, or `Clean up` state.
3. Add storage quota estimation before staging large packs.
4. Add route graph regression selfchecks for fastest/safest/eco/no-toll path selection.
5. Add native Melange smoke-test contracts for Android/iOS fallback-safe execution.
