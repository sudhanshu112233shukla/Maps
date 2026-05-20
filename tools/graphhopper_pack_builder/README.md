# GraphHopper Pack Builder

Builds production-ready offline GraphHopper routing packs with manifest, metadata, checksums, and zip artifact.

## Prerequisites

- GraphHopper tooling JAR compatible with runtime `9.0`
- Java 17+
- OSM PBF for target region

## Usage

```bash
python tools/graphhopper_pack_builder/build_pack.py \
  --region-id india_up_prayagraj \
  --osm-pbf data/osm/india-up-prayagraj.osm.pbf \
  --graphhopper-jar tools/graphhopper/graphhopper-web-9.0.jar \
  --output-root packs \
  --graph-version 1.0.0 \
  --osm-source geofabrik \
  --osm-date 2026-05-20 \
  --locales en,hi
```

## Output

`packs/<regionId>/`
- `manifest.json`
- `metadata.json`
- `graphhopper/` (import output)
- `checksums/checksums.json`
- `pack.zip`