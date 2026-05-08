# Performance Budgets

These budgets are used to keep feature work grounded on device constraints.

## Target Devices

- Android phones with 4 GB RAM (primary baseline)
- Automotive Android head units (secondary baseline)

## Budget Table

- Cold startup to interactive map: `<= 2.5s`
- Warm startup to interactive map: `<= 1.2s`
- Pan/zoom render stability: `>= 50 FPS` target
- Search latency: `P95 <= 100ms`
- Reroute latency (city): `<= 250ms`
- Reroute latency (intercity): `<= 1.2s`
- Foreground RAM: `<= 350MB` on 4 GB devices

## Guardrails In Code

- Use bounded caches only (no unbounded maps/lists in hot paths).
- Keep search/routing/AI work off UI thread.
- Keep map style/source updates lifecycle-safe.
- Avoid repeated re-indexing unless data actually changed.

## Profiling Checklist

Before merge on performance-sensitive changes:

1. Capture startup time (cold + warm).
2. Capture route and search latency samples.
3. Check memory growth under repeated search/reroute loops.
4. Verify no frame-drop spikes during style/source swaps.
