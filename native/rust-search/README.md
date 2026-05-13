# Rust Search Module

This crate exposes a C ABI used by Android/iOS `RustSearch` plugins.

## Exported Symbols

- `rust_search_prepare_index(region_id, graph_path, poi_path, data_version) -> bool`
- `rust_search_search(query, region_id, limit, bias_lng, bias_lat) -> *const c_char`
- `rust_search_free_string(ptr)`

## Build

```bash
cd native/rust-search
cargo build --release
```

Android outputs (`.so` to `android/app/src/main/jniLibs`):

```powershell
powershell -ExecutionPolicy Bypass -File native/rust-search/scripts/build_android.ps1
```

iOS static library (`libmelange_rust_search.a`):

```bash
bash native/rust-search/scripts/build_ios.sh
```

## Integration Notes

- Android plugin expects shared library name: `libmelange_rust_search.so`.
- iOS plugin loads symbols from process image and falls back if symbols are unavailable.
- Current engine indexes POI JSON and returns ranked local matches.
- JS fallback search remains active when native module is absent.
