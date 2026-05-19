# Device Validation Matrix

This matrix is the minimum hardware coverage for demo readiness (Android + iOS).

## Android

- Low-end (4 GB RAM): Snapdragon 6xx / Helio G-series class, Android 12+
- Mid-range (6–8 GB RAM): Snapdragon 7xx class, Android 13+
- High-end (12+ GB RAM): Snapdragon 8 Gen class, Android 14+

## iOS

- Baseline device: iPhone 12 / iPhone 13 class, iOS 16+

## Required Scenarios (Run On Every Device)

1. Cold start with airplane mode enabled
2. Region pack download start → pause → resume → complete
3. Interrupt update (force close app) → relaunch → recover state (transaction becomes `interrupted`)
4. Search: multilingual + typos (example: `allahbad staton`, `इलाहाबाद जंक्शन`)
5. Routing: `fastest`, `safest`, `eco`, `no-toll`
6. Navigation HUD: start → stop, ensure no UI lockups

