# GraphHopper Pack Build Status (2026-05-21)

## Active Small Demo Targets
- `india_goa`
- `usa_hawaii`
- `kr_seoul_core` (custom clipped PBF)

## Input files expected
Place these in `tools/osm_inputs/`:
- `india_goa.osm.pbf`
- `usa_hawaii.osm.pbf`
- `kr_seoul_core.osm.pbf`

## Build scripts
- `tools/graphhopper_pack_builder/run_build_india_goa.ps1`
- `tools/graphhopper_pack_builder/run_build_usa_hawaii.ps1`
- `tools/graphhopper_pack_builder/run_build_kr_seoul_core.ps1`
- `tools/graphhopper_pack_builder/run_build_demo_small.ps1`

## Run all
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/graphhopper_pack_builder/run_build_demo_small.ps1
```
