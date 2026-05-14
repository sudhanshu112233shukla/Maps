# OSM Graph Pipeline

This pipeline generates region routing graphs directly from OSM PBF exports.

## Inputs

- Region manifest: `tools/osm_pipeline/region_manifest.json`
- OSM PBF files downloaded from Geofabrik
- Current manifest includes: `india`, `usa`, `skorea`, `europe`, `japan`, `uk`, `russia`, `australia`

## Outputs

- Region graph files under `public/data/graph/<region>.json`

## Setup

```bash
python -m pip install -r tools/osm_pipeline/requirements.txt
```

## Build All Enabled Regions

```bash
python tools/osm_pipeline/build_from_manifest.py
```

## Build Single Region

```bash
python tools/osm_pipeline/build_from_manifest.py --region-id india
python tools/osm_pipeline/build_from_manifest.py --region-id usa
python tools/osm_pipeline/build_from_manifest.py --region-id skorea
python tools/osm_pipeline/build_from_manifest.py --region-id europe
```

## Rebuild From Existing PBF

```bash
python tools/osm_pipeline/build_from_manifest.py --region-id india --skip-download
```

## Validate Generated Graph Bundles

```bash
python tools/osm_pipeline/validate_graph_bundle.py
python tools/osm_pipeline/validate_graph_bundle.py --region-id india
python tools/osm_pipeline/validate_graph_bundle.py --region-id usa
python tools/osm_pipeline/validate_graph_bundle.py --region-id skorea
python tools/osm_pipeline/validate_graph_bundle.py --region-id europe
```

## Notes

- Graph output keeps only drivable highway classes.
- Direction and toll attributes are preserved.
- Speeds are inferred from `maxspeed` when available, otherwise highway defaults are used.
- By default, only `india` is enabled in the manifest; enable other regions explicitly before `graph:build`.
