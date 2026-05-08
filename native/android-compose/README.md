# Android Compose Native Skeleton

This directory defines the production-native direction for Melange Maps.

Current repository runtime remains Capacitor-based for fast iteration. This native module is the long-term target stack:

- Kotlin
- Jetpack Compose
- MapLibre Native
- Native routing/search/AI services

## Module Intent

- `core/contracts`: stable interfaces for map, search, route, AI, and pack management
- `app`: Compose shell that depends on contracts, not concrete engines

Concrete implementations can evolve independently:

- GraphHopper/Valhalla adapters for routing
- Rust FFI adapter for search
- Melange adapter for on-device AI
