# OSM Graph Pipeline

This pipeline generates region routing graphs directly from OSM PBF exports.

## Inputs

- Region manifest: `tools/osm_pipeline/region_manifest.json`
- OSM PBF files downloaded from Geofabrik

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
```

## Rebuild From Existing PBF

```bash
python tools/osm_pipeline/build_from_manifest.py --region-id india --skip-download
```

## Validate Generated Graph Bundles

```bash
python tools/osm_pipeline/validate_graph_bundle.py
python tools/osm_pipeline/validate_graph_bundle.py --region-id india
```

## Notes

- Graph output keeps only drivable highway classes.
- Direction and toll attributes are preserved.
- Speeds are inferred from `maxspeed` when available, otherwise highway defaults are used.
