#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path


REQUIRED_META_KEYS = {
    "regionId",
    "source",
    "sourceBytes",
    "sourceMtimeUtc",
    "generatedAtUtc",
    "bundleVersion",
    "nodeCount",
    "edgeCount",
    "formatVersion",
}


def parse_iso8601(value: object, field: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"meta.{field} must be a non-empty string")
    candidate = value.replace("Z", "+00:00")
    datetime.fromisoformat(candidate)


def ensure_int(value: object, field: str, minimum: int = 0) -> int:
    if not isinstance(value, int):
        raise ValueError(f"{field} must be an integer")
    if value < minimum:
        raise ValueError(f"{field} must be >= {minimum}")
    return value


def validate_graph(graph_path: Path, expected_region: str | None) -> dict:
    if not graph_path.exists():
        raise ValueError(f"graph does not exist: {graph_path}")

    payload = json.loads(graph_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("graph payload must be a JSON object")

    nodes = payload.get("nodes")
    edges = payload.get("edges")
    meta = payload.get("meta")

    if not isinstance(nodes, dict):
        raise ValueError("nodes must be an object map")
    if not isinstance(edges, dict):
        raise ValueError("edges must be an object map")
    if not isinstance(meta, dict):
        raise ValueError("meta must be an object")

    missing_meta = sorted(REQUIRED_META_KEYS.difference(meta.keys()))
    if missing_meta:
        raise ValueError(f"missing meta keys: {', '.join(missing_meta)}")

    region_id = meta.get("regionId")
    if not isinstance(region_id, str) or not region_id:
        raise ValueError("meta.regionId must be a non-empty string")
    if expected_region and region_id != expected_region:
        raise ValueError(f"meta.regionId mismatch: expected {expected_region}, got {region_id}")

    source = meta.get("source")
    if not isinstance(source, str) or not source:
        raise ValueError("meta.source must be a non-empty string")

    ensure_int(meta.get("sourceBytes"), "meta.sourceBytes", 1)
    parse_iso8601(meta.get("sourceMtimeUtc"), "sourceMtimeUtc")
    parse_iso8601(meta.get("generatedAtUtc"), "generatedAtUtc")
    ensure_int(meta.get("bundleVersion"), "meta.bundleVersion", 1)

    node_count = ensure_int(meta.get("nodeCount"), "meta.nodeCount", 0)
    edge_count = ensure_int(meta.get("edgeCount"), "meta.edgeCount", 0)

    if meta.get("formatVersion") != "v2":
        raise ValueError("meta.formatVersion must be 'v2'")

    observed_nodes = len(nodes)
    if observed_nodes != node_count:
        raise ValueError(f"meta.nodeCount mismatch: meta={node_count}, observed={observed_nodes}")

    observed_edges = 0
    node_ids = set(nodes.keys())

    for node_id, coord in nodes.items():
        if not isinstance(node_id, str) or not node_id:
            raise ValueError("node ids must be non-empty strings")
        if not isinstance(coord, list) or len(coord) != 2:
            raise ValueError(f"node '{node_id}' must have [lng, lat]")
        lng, lat = coord
        if not isinstance(lng, (int, float)) or not isinstance(lat, (int, float)):
            raise ValueError(f"node '{node_id}' coordinates must be numeric")

    for from_node, adjacency in edges.items():
        if from_node not in node_ids:
            raise ValueError(f"edge origin '{from_node}' is missing in nodes")
        if not isinstance(adjacency, list):
            raise ValueError(f"edges['{from_node}'] must be a list")

        for item in adjacency:
            observed_edges += 1
            if not isinstance(item, dict):
                raise ValueError(f"edge entry in '{from_node}' must be an object")
            to_node = item.get("to")
            if not isinstance(to_node, str) or not to_node:
                raise ValueError(f"edge in '{from_node}' has invalid 'to'")
            if to_node not in node_ids:
                raise ValueError(f"edge in '{from_node}' points to unknown node '{to_node}'")

            ensure_int(item.get("dist"), f"edge[{from_node}].dist", 1)
            ensure_int(item.get("time"), f"edge[{from_node}].time", 1)

            edge_type = item.get("type")
            if not isinstance(edge_type, str) or not edge_type:
                raise ValueError(f"edge[{from_node}] has invalid 'type'")

            toll = item.get("toll")
            if not isinstance(toll, bool):
                raise ValueError(f"edge[{from_node}] has invalid 'toll'")

    if observed_edges != edge_count:
        raise ValueError(f"meta.edgeCount mismatch: meta={edge_count}, observed={observed_edges}")

    return {
        "regionId": region_id,
        "graphPath": str(graph_path),
        "nodeCount": observed_nodes,
        "edgeCount": observed_edges,
    }


def iter_targets(manifest_path: Path, region_id: str) -> list[tuple[str, Path]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    regions = manifest.get("regions", [])
    repo_root = manifest_path.resolve().parents[2]
    targets: list[tuple[str, Path]] = []

    for region in regions:
        if not region.get("enabled", False):
            continue
        rid = region.get("id")
        output_graph = region.get("output_graph")
        if not isinstance(rid, str) or not rid:
            continue
        if region_id and rid != region_id:
            continue
        if not isinstance(output_graph, str) or not output_graph:
            continue
        targets.append((rid, repo_root / output_graph))
    return targets


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate generated routing graph bundles")
    parser.add_argument(
        "--manifest",
        default="tools/osm_pipeline/region_manifest.json",
        help="manifest path used to resolve graph output paths",
    )
    parser.add_argument("--region-id", default="", help="optional single region id")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    manifest_path = repo_root / args.manifest
    targets = iter_targets(manifest_path, args.region_id)

    if not targets:
        raise SystemExit("No enabled graph targets found for validation")

    for rid, graph_path in targets:
        summary = validate_graph(graph_path, rid)
        print(
            f"[ok] {summary['regionId']}: "
            f"nodes={summary['nodeCount']} edges={summary['edgeCount']} -> {summary['graphPath']}"
        )


if __name__ == "__main__":
    main()
