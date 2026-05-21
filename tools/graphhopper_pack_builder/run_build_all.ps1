$ErrorActionPreference = 'Stop'
Set-Location 'H:\maps\Maps'

function Run-Pack($regionId,$osm,$locales){
  python tools/graphhopper_pack_builder/build_pack.py `
    --region-id $regionId `
    --osm-pbf $osm `
    --graphhopper-jar tools/graphhopper/graphhopper-web-9.0.jar `
    --output-root packs `
    --graph-version 1.0.0 `
    --osm-source geofabrik `
    --osm-date 2026-05-19 `
    --locales $locales
}

Run-Pack 'india_up_prayagraj' 'tools/osm_inputs/india_up_prayagraj.osm.pbf' 'en,hi'
Run-Pack 'usa_california_sf' 'tools/osm_inputs/usa_california_sf.osm.pbf' 'en'
Run-Pack 'kr_seoul' 'tools/osm_inputs/kr_seoul.osm.pbf' 'en,ko'
