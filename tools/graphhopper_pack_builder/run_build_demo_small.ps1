$ErrorActionPreference = 'Stop'
Set-Location 'H:\maps\Maps'
& tools/graphhopper_pack_builder/run_build_india_goa.ps1
& tools/graphhopper_pack_builder/run_build_usa_hawaii.ps1
& tools/graphhopper_pack_builder/run_build_kr_seoul_core.ps1
