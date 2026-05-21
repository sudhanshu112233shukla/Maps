# GraphHopper Pack Build Status (2026-05-21)

## Completed
- `uk_scotland` ✅
  - Artifacts: `packs/uk_scotland/manifest.json`, `metadata.json`, `checksums/checksums.json`, `pack.zip`, `graphhopper/*`
  - `pack.zip` checksum matches `manifest.json`.

## Blocked on this machine
- `india_up_prayagraj` ❌
- `usa_california_sf` ❌
- `kr_seoul` ❌

Failure reason:
- Java heap OOM during GraphHopper import on this host.
- Host RAM: ~4 GB (`TotalPhysicalMemory=4101320704`).

## Required to complete remaining regions
Pick one:
1. Build on a machine with >= 16 GB RAM, or
2. Use smaller city-level PBF extracts for India/USA/Korea.

## Recommended build commands (higher-memory host)
```powershell
python tools/graphhopper_pack_builder/build_pack.py --region-id india_up_prayagraj --osm-pbf tools/osm_inputs/india_up_prayagraj.osm.pbf --graphhopper-jar tools/graphhopper/graphhopper-web-9.0.jar --output-root packs --graph-version 1.0.0 --osm-source geofabrik --osm-date 2026-05-19 --locales en,hi --java-opts -Xms2g -Xmx10g

python tools/graphhopper_pack_builder/build_pack.py --region-id usa_california_sf --osm-pbf tools/osm_inputs/usa_california_sf.osm.pbf --graphhopper-jar tools/graphhopper/graphhopper-web-9.0.jar --output-root packs --graph-version 1.0.0 --osm-source geofabrik --osm-date 2026-05-19 --locales en --java-opts -Xms2g -Xmx12g

python tools/graphhopper_pack_builder/build_pack.py --region-id kr_seoul --osm-pbf tools/osm_inputs/kr_seoul.osm.pbf --graphhopper-jar tools/graphhopper/graphhopper-web-9.0.jar --output-root packs --graph-version 1.0.0 --osm-source geofabrik --osm-date 2026-05-19 --locales en,ko --java-opts -Xms2g -Xmx8g
```
