#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
import urllib.request
from pathlib import Path


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        print(f"[skip] already downloaded: {target}")
        return
    print(f"[download] {url} -> {target}")
    urllib.request.urlretrieve(url, target)


def run_graph_builder(region: dict, pbf_path: Path, repo_root: Path) -> None:
    output_path = repo_root / region["output_graph"]
    script = repo_root / "tools" / "osm_pipeline" / "build_region_graph.py"
    command = [
        "python",
        str(script),
        "--region-id",
        region["id"],
        "--input-pbf",
        str(pbf_path),
        "--output",
        str(output_path),
        "--max-nodes",
        str(region.get("max_nodes", 450000)),
    ]
    print(f"[build] {' '.join(command)}")
    subprocess.run(command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build region graphs from OSM manifest")
    parser.add_argument(
        "--manifest",
        default="tools/osm_pipeline/region_manifest.json",
        help="manifest path",
    )
    parser.add_argument(
        "--data-dir",
        default="data/osm",
        help="directory to store PBF files",
    )
    parser.add_argument("--region-id", default="", help="optional single region id")
    parser.add_argument("--skip-download", action="store_true", help="assume PBF already exists")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    manifest_path = repo_root / args.manifest
    pbf_dir = repo_root / args.data_dir

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    regions = manifest.get("regions", [])

    for region in regions:
        if not region.get("enabled", False):
            continue
        if args.region_id and region["id"] != args.region_id:
            continue

        pbf_path = pbf_dir / region["pbf_file"]
        if not args.skip_download:
            download(region["pbf_url"], pbf_path)
        run_graph_builder(region, pbf_path, repo_root)


if __name__ == "__main__":
    main()
