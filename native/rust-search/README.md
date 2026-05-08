# Rust Search Engine Skeleton

This folder defines the direction for the offline multilingual search core.

Target:

- Rust service/library with Tantivy-compatible indexing model
- FFI bridge for Android (JNI) and iOS
- Local query API with transliteration, typo tolerance, and semantic rank features

Expected API surface:

- `build_index(region_pack_path)`
- `search(query, locale, region_id, lat, lng, limit)`
- `suggest(prefix, locale, region_id, limit)`

Data responsibilities:

- token normalization
- Hinglish transliteration
- phonetic index
- fuzzy matching
- compact binary index serialization
