#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_regions(repo_root: Path) -> list[dict]:
    manifest_path = repo_root / "tools" / "osm_pipeline" / "region_manifest.json"
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    return [region for region in payload.get("regions", []) if isinstance(region, dict) and region.get("id")]


def to_public_path(repo_root: Path, absolute: Path) -> str:
    return "/" + str(absolute.relative_to(repo_root / "public")).replace("\\", "/")


def sync_region(repo_root: Path, region: dict, data_version: str) -> dict:
    region_id = region["id"]
    graph_abs = repo_root / region["output_graph"]
    poi_abs = repo_root / "public" / "data" / "poi" / f"{region_id}.json"
    map_abs = repo_root / "public" / "data" / "maps" / f"{region_id}.pmtiles"
    pack_dir = repo_root / "public" / "data" / "packs"
    pack_dir.mkdir(parents=True, exist_ok=True)

    graph_exists = graph_abs.exists()
    poi_exists = poi_abs.exists()
    map_exists = map_abs.exists()

    assets = []
    if map_exists:
        assets.append(
            {
                "path": to_public_path(repo_root, map_abs),
                "required": False,
            }
        )
    else:
        assets.append(
            {
                "path": f"/data/maps/{region_id}.pmtiles",
                "required": False,
            }
        )

    if graph_exists:
        assets.append(
            {
                "path": to_public_path(repo_root, graph_abs),
                "required": True,
                "sha256": sha256(graph_abs),
                "sizeBytes": graph_abs.stat().st_size,
            }
        )

    if poi_exists:
        assets.append(
            {
                "path": to_public_path(repo_root, poi_abs),
                "required": True,
                "sha256": sha256(poi_abs),
                "sizeBytes": poi_abs.stat().st_size,
            }
        )

    manifest = {
        "regionId": region_id,
        "dataVersion": data_version,
        "schemaVersion": 1,
        "assets": assets,
    }
    (pack_dir / f"{region_id}.manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )

    delta = {
        "regionId": region_id,
        "schemaVersion": 1,
        "baseVersion": data_version,
        "dataVersion": data_version,
        "patchAssets": [],
        "deleteAssets": [],
    }
    (pack_dir / f"{region_id}.delta.json").write_text(
        json.dumps(delta, indent=2) + "\n",
        encoding="utf-8",
    )

    return {
        "regionId": region_id,
        "graphExists": graph_exists,
        "poiExists": poi_exists,
        "mapExists": map_exists,
        "manifestPath": str(pack_dir / f"{region_id}.manifest.json"),
        "deltaPath": str(pack_dir / f"{region_id}.delta.json"),
    }


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    regions = load_regions(repo_root)
    results = [sync_region(repo_root, region, data_version="2026.05") for region in regions]
    for item in results:
        print(
            f"[ok] {item['regionId']}: graph={item['graphExists']} poi={item['poiExists']} map={item['mapExists']}"
        )


if __name__ == "__main__":
    main()
