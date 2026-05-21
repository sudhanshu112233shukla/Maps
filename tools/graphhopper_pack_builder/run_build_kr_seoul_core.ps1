$ErrorActionPreference = 'Stop'
Set-Location 'H:\maps\Maps'
python tools/graphhopper_pack_builder/build_pack.py `
  --region-id kr_seoul_core `
  --osm-pbf tools/osm_inputs/kr_seoul_core.osm.pbf `
  --graphhopper-jar tools/graphhopper/graphhopper-web-9.0.jar `
  --output-root packs `
  --graph-version 1.0.0 `
  --osm-source geofabrik/custom-bbox `
  --osm-date 2026-05-19 `
  --locales en,ko `
  --java-opts -Xms512m -Xmx2200m
