#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path


def load_regions(repo_root: Path) -> list[dict]:
    manifest = json.loads((repo_root / "tools" / "osm_pipeline" / "region_manifest.json").read_text(encoding="utf-8"))
    return [region for region in manifest.get("regions", []) if isinstance(region, dict) and region.get("id")]


def region_status(repo_root: Path, region_id: str) -> dict:
    graph = repo_root / "public" / "data" / "graph" / f"{region_id}.json"
    poi = repo_root / "public" / "data" / "poi" / f"{region_id}.json"
    pack = repo_root / "public" / "data" / "maps" / f"{region_id}.pmtiles"
    manifest = repo_root / "public" / "data" / "packs" / f"{region_id}.manifest.json"
    delta = repo_root / "public" / "data" / "packs" / f"{region_id}.delta.json"

    missing = []
    for key, file_path in {
        "graph": graph,
        "poi": poi,
        "manifest": manifest,
        "delta": delta,
    }.items():
        if not file_path.exists():
            missing.append(key)

    # PMTiles is currently optional in runtime path.
    if not pack.exists():
        missing.append("map(optional)")

    release_ready = "graph" not in missing and "poi" not in missing and "manifest" not in missing and "delta" not in missing
    return {
        "regionId": region_id,
        "releaseReady": release_ready,
        "hasGraph": graph.exists(),
        "hasPoi": poi.exists(),
        "hasMap": pack.exists(),
        "hasManifest": manifest.exists(),
        "hasDelta": delta.exists(),
        "missing": missing,
    }


def write_markdown(path: Path, regions: list[dict]) -> None:
    lines = [
        "# Region Release Readiness",
        "",
        "| Region | Ready | Missing |",
        "| --- | --- | --- |",
    ]
    for region in regions:
        missing = ", ".join(region["missing"]) if region["missing"] else "none"
        lines.append(f"| {region['regionId']} | {'yes' if region['releaseReady'] else 'no'} | {missing} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    regions = load_regions(repo_root)
    statuses = [region_status(repo_root, region["id"]) for region in regions]

    out_dir = repo_root / "public" / "data" / "releases"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "readiness.json").write_text(json.dumps({"regions": statuses}, indent=2) + "\n", encoding="utf-8")
    write_markdown(repo_root / "docs" / "REGION_RELEASE_READINESS.md", statuses)

    ready = [item for item in statuses if item["releaseReady"]]
    print(f"[ok] readiness report generated: {len(ready)}/{len(statuses)} regions release-ready")


if __name__ == "__main__":
    main()
