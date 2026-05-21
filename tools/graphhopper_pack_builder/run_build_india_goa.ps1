$ErrorActionPreference = 'Stop'
Set-Location 'H:\maps\Maps'
python tools/graphhopper_pack_builder/build_pack.py `
  --region-id india_goa `
  --osm-pbf tools/osm_inputs/india_goa.osm.pbf `
  --graphhopper-jar tools/graphhopper/graphhopper-web-9.0.jar `
  --output-root packs `
  --graph-version 1.0.0 `
  --osm-source geofabrik `
  --osm-date 2026-05-19 `
  --locales en,hi `
