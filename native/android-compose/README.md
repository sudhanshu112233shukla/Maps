# Android Compose Native Skeleton

This directory defines the production-native direction for Melange Maps.

Current repository runtime remains Capacitor-based for fast iteration. This native module now includes a bootstrapped Compose app shell (`app/`) and remains the long-term target stack:

- Kotlin
- Jetpack Compose
- MapLibre Native
- Native routing/search/AI services

## Module Intent

- `core/contracts`: stable interfaces for map, search, route, AI, and pack management
- `app`: Compose application shell with `MainActivity` and Material3 baseline

Concrete implementations can evolve independently:

- GraphHopper/Valhalla adapters for routing
- Rust FFI adapter for search
- Melange adapter for on-device AI

## Build Entry

- `native/android-compose/settings.gradle.kts`
- `native/android-compose/build.gradle.kts`
- `native/android-compose/app/build.gradle.kts`

This module is scaffolded for incremental migration; MapLibre Native embedding is the next step inside the Compose shell.
