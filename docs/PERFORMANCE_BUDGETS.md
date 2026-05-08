# Performance Budgets

## Device Targets

Primary target:
- Android devices with `4 GB RAM`
- Mid-range CPU
- Low to moderate thermal headroom

Secondary target:
- Automotive head units with constrained CPU/GPU and strict reliability expectations

## Budgets

### Startup

- Cold start to interactive map: `<= 2.5s`
- Warm start to interactive map: `<= 1.2s`

### Rendering

- Steady-state FPS during pan/zoom: `>= 50 FPS`
- Frame drops over 5s interaction window: `< 5%`

### Search

- P50 query latency: `< 40 ms`
- P95 query latency: `< 100 ms`
- Memory growth under repeated query loop: bounded, no unbounded cache growth

### Routing

- City reroute latency target: `< 250 ms`
- Intercity route latency target: `< 1.2 s`

### AI Inference

- Intent parse (short query): `< 400 ms` on supported accelerators
- Voice command parse end-to-end: `< 1.5 s`

### Resource Use

- Foreground RAM budget:
  - low-end device: `<= 350 MB`
  - mainstream device: `<= 500 MB`
- Background CPU average during idle navigation: `< 15%`
- Sustained thermal throttle events: zero in normal navigation scenarios

## Engineering Controls

- Keep caches bounded (LRU by count and size).
- Use binary-packed graph/index assets.
- Run route and search off the UI thread.
- Debounce high-frequency UI-driven recomputations.
- Avoid frequent allocation spikes in hot paths.

## Observability

Collect on-device metrics:
- frame time histogram
- search latency histogram
- routing latency histogram
- memory snapshots by subsystem
- model load/inference timings

Export diagnostics only when connectivity is available and user policy allows it.
