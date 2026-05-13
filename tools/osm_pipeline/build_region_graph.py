#!/usr/bin/env python3
"""
Build an automobile routing graph from an OSM PBF.

Output format matches the app's graph contract:
{
  "nodes": { "<node_id>": [lng, lat], ... },
  "edges": { "<node_id>": [{ "to": "<node_id>", "dist": meters, "time": seconds, "type": highway_type, "toll": bool }], ... },
  "meta": { ... }
}
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

try:
    import osmium  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "pyosmium is required. Install with: pip install -r tools/osm_pipeline/requirements.txt"
    ) from exc


DRIVABLE_HIGHWAYS = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "residential",
    "living_street",
    "service",
    "unclassified",
}

DEFAULT_SPEED_KPH = {
    "motorway": 110,
    "motorway_link": 70,
    "trunk": 90,
    "trunk_link": 60,
    "primary": 70,
    "primary_link": 55,
    "secondary": 55,
    "secondary_link": 45,
    "tertiary": 45,
    "tertiary_link": 35,
    "residential": 30,
    "living_street": 15,
    "service": 20,
    "unclassified": 35,
}


def haversine_meters(a_lng: float, a_lat: float, b_lng: float, b_lat: float) -> float:
    radius = 6_371_000
    d_lat = math.radians(b_lat - a_lat)
    d_lng = math.radians(b_lng - a_lng)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a_lat))
        * math.cos(math.radians(b_lat))
        * math.sin(d_lng / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_speed_kph(raw_speed: Optional[str], highway_type: str) -> int:
    if raw_speed:
        match = re.search(r"(\d+)", raw_speed)
        if match:
            value = int(match.group(1))
            if "mph" in raw_speed.lower():
                return max(15, int(value * 1.60934))
            return max(15, value)
    return DEFAULT_SPEED_KPH.get(highway_type, 35)


def parse_oneway(raw: Optional[str]) -> int:
    if not raw:
        return 0
    value = raw.strip().lower()
    if value in {"yes", "true", "1"}:
        return 1
    if value == "-1":
        return -1
    return 0


class WayCollector(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.node_ids: Set[int] = set()
        self.ways: List[dict] = []

    def way(self, w: osmium.osm.Way) -> None:
        highway = w.tags.get("highway")
        if highway not in DRIVABLE_HIGHWAYS:
            return
        refs = [n.ref for n in w.nodes]
        if len(refs) < 2:
            return
        oneway = parse_oneway(w.tags.get("oneway"))
        toll = (w.tags.get("toll") or "").lower() in {"yes", "true", "1"}
        speed_kph = parse_speed_kph(w.tags.get("maxspeed"), highway)

        self.ways.append(
            {
                "id": str(w.id),
                "refs": refs,
                "type": highway,
                "oneway": oneway,
                "toll": toll,
                "speed_kph": speed_kph,
            }
        )
        self.node_ids.update(refs)


class NodeCollector(osmium.SimpleHandler):
    def __init__(self, required_ids: Set[int], max_nodes: Optional[int] = None) -> None:
        super().__init__()
        self.required_ids = required_ids
        self.max_nodes = max_nodes
        self.coords: Dict[int, Tuple[float, float]] = {}

    def node(self, n: osmium.osm.Node) -> None:
        if n.id not in self.required_ids:
            return
        if self.max_nodes and len(self.coords) >= self.max_nodes:
            return
        if not n.location.valid():
            return
        self.coords[n.id] = (n.location.lon, n.location.lat)


def append_edge(
    edges: Dict[str, List[dict]],
    from_node: str,
    to_node: str,
    dist: int,
    time_seconds: int,
    road_type: str,
    toll: bool,
) -> None:
    edges[from_node].append(
        {
            "to": to_node,
            "dist": dist,
            "time": time_seconds,
            "type": road_type,
            "toll": toll,
        }
    )


def build_graph(ways: Iterable[dict], coords: Dict[int, Tuple[float, float]]) -> dict:
    nodes: Dict[str, List[float]] = {}
    edges: Dict[str, List[dict]] = defaultdict(list)

    for way in ways:
        refs = [node_id for node_id in way["refs"] if node_id in coords]
        if len(refs) < 2:
            continue

        for i in range(len(refs) - 1):
            source_id = refs[i]
            target_id = refs[i + 1]
            source_lng, source_lat = coords[source_id]
            target_lng, target_lat = coords[target_id]
            dist = max(1, int(haversine_meters(source_lng, source_lat, target_lng, target_lat)))
            speed_mps = max(2.0, way["speed_kph"] * 1000 / 3600)
            time_seconds = max(1, int(dist / speed_mps))

            source_key = str(source_id)
            target_key = str(target_id)
            nodes[source_key] = [source_lng, source_lat]
            nodes[target_key] = [target_lng, target_lat]

            if way["oneway"] == -1:
                append_edge(edges, target_key, source_key, dist, time_seconds, way["type"], way["toll"])
                continue

            append_edge(edges, source_key, target_key, dist, time_seconds, way["type"], way["toll"])
            if way["oneway"] == 0:
                append_edge(edges, target_key, source_key, dist, time_seconds, way["type"], way["toll"])

    return {
        "nodes": nodes,
        "edges": dict(edges),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build routing graph from OSM PBF")
    parser.add_argument("--region-id", required=True)
    parser.add_argument("--input-pbf", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-nodes", type=int, default=450000)
    args = parser.parse_args()

    pbf_path = Path(args.input_pbf)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not pbf_path.exists():
        raise SystemExit(f"Input PBF not found: {pbf_path}")

    way_collector = WayCollector()
    way_collector.apply_file(str(pbf_path), locations=False)

    node_collector = NodeCollector(way_collector.node_ids, max_nodes=args.max_nodes)
    node_collector.apply_file(str(pbf_path), locations=False)

    graph = build_graph(way_collector.ways, node_collector.coords)
    graph["meta"] = {
        "regionId": args.region_id,
        "source": str(pbf_path),
        "nodeCount": len(graph["nodes"]),
        "edgeCount": sum(len(v) for v in graph["edges"].values()),
        "formatVersion": "v2",
    }

    output_path.write_text(json.dumps(graph, separators=(",", ":")), encoding="utf-8")
    print(
        f"[ok] {args.region_id}: nodes={graph['meta']['nodeCount']} "
        f"edges={graph['meta']['edgeCount']} -> {output_path}"
    )


if __name__ == "__main__":
    main()
