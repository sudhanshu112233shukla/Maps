# GraphHopper Pack Build Status (2026-05-21)

## Active Small Demo Targets
- `india_goa` ✅ built
- `usa_hawaii` ✅ built
- `kr_seoul_core` ✅ built

## Build result
All three packs were generated under `packs/` with:
- `manifest.json`
- `metadata.json`
- `checksums/checksums.json`
- `pack.zip`

Checksum verification:
- `india_goa` ✅
- `usa_hawaii` ✅
- `kr_seoul_core` ✅

Note:
- `kr_seoul_core` currently uses the full South Korea input PBF you provided (`south-korea-260519.osm.pbf`) mapped to the Seoul-core target id for demo continuity.

## Runtime wiring
- Region manifests now include GraphHopper bundle metadata fields:
  - `graphhopperBundleUrl`
  - `graphhopperChecksum`
  - `graphhopperVersion`
  - `graphhopperDir`
- Local promoted bundles copied to `public/data/graphhopper_packs/<region>/pack.zip` for demo runtime.
