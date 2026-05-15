#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def ensure_exists(path: Path, label: str) -> None:
    if not path.exists():
        raise SystemExit(f"Missing {label}: {path}")


def load_json(path: Path) -> dict | list:
    return json.loads(path.read_text(encoding="utf-8"))


def compute_manifest_sha(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


def update_manifest(repo_root: Path, region_id: str, graph_path: str, poi_path: str, map_path: str) -> None:
    manifest_path = repo_root / "public" / "data" / "packs" / f"{region_id}.manifest.json"
    ensure_exists(manifest_path, "manifest")
    manifest = load_json(manifest_path)
    if not isinstance(manifest, dict):
        raise SystemExit(f"Invalid manifest payload: {manifest_path}")
    assets = manifest.get("assets", [])
    if not isinstance(assets, list):
        raise SystemExit(f"Invalid manifest assets in {manifest_path}")

    hash_by_path = {
        graph_path: compute_manifest_sha(repo_root / "public" / graph_path.lstrip("/")),
        poi_path: compute_manifest_sha(repo_root / "public" / poi_path.lstrip("/")),
    }

    seen = set()
    for asset in assets:
        asset_path = asset.get("path")
        if asset_path in hash_by_path:
            asset["required"] = True
            asset["sha256"] = hash_by_path[asset_path]
            seen.add(asset_path)
        if asset_path == map_path:
            asset.setdefault("required", False)
    for required_path, sha in hash_by_path.items():
        if required_path not in seen:
            assets.append(
                {
                    "path": required_path,
                    "required": True,
                    "sha256": sha,
                }
            )

    manifest["assets"] = assets
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def promote_offline_region(repo_root: Path, region_id: str) -> None:
    regions_path = repo_root / "src" / "offline" / "offlineRegions.js"
    source = regions_path.read_text(encoding="utf-8")

    pattern = re.compile(
        rf"(id:\s*'{re.escape(region_id)}'[\s\S]*?releaseStatus:\s*')planned(')",
        re.MULTILINE,
    )
    updated, count = pattern.subn(r"\1released\2", source, count=1)
    if count == 0:
        raise SystemExit(f"Region '{region_id}' is not found or already released in offlineRegions.js")
    regions_path.write_text(updated, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote region from planned to released with manifest checksum refresh")
    parser.add_argument("--region-id", required=True)
    parser.add_argument("--graph-path", required=True, help="example: /data/graph/usa.json")
    parser.add_argument("--poi-path", required=True, help="example: /data/poi/usa.json")
    parser.add_argument("--map-path", required=True, help="example: /data/maps/usa.pmtiles")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    for relative in [args.graph_path, args.poi_path, args.map_path]:
      ensure_exists(repo_root / "public" / relative.lstrip("/"), f"asset {relative}")

    update_manifest(repo_root, args.region_id, args.graph_path, args.poi_path, args.map_path)
    promote_offline_region(repo_root, args.region_id)
    print(f"[ok] promoted region '{args.region_id}' to released and refreshed manifest checksums")


if __name__ == "__main__":
    main()
