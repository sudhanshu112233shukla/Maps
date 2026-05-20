# GraphHopper Pack Pipeline

This phase enables GraphHopper as the primary offline routing backend when graph packs are activated.

## Build Pack

```bash
npm run graphhopper:pack:build -- --region-id india_up_prayagraj --osm-pbf data/osm/india-up-prayagraj.osm.pbf --graphhopper-jar tools/graphhopper/graphhopper-web-9.0.jar --output-root packs --graph-version 1.0.0
```

## Activation Model

- `download_tmp/`: archive download staging
- `validation/`: checksum + compatibility checks
- `activation/`: active pointer writes
- rollback removes active pointer and keeps JS fallback available

## Runtime

- `RoutingManager.prepareRegion()` resolves `graphhopperDir` from region status + `GraphPackRegistry`
- GraphHopper becomes active only when native `prepare()` succeeds
- Use `window.getNavigationHealth()` for backend/runtime diagnostics