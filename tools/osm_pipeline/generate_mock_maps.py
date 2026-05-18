#!/usr/bin/env python3
from pathlib import Path

REGIONS = ["india", "usa", "uk", "europe", "skorea", "japan", "russia", "australia"]

def main():
    repo_root = Path(__file__).resolve().parents[2]
    maps_dir = repo_root / "public" / "data" / "maps"
    maps_dir.mkdir(parents=True, exist_ok=True)
    
    for region in REGIONS:
        map_file = maps_dir / f"{region}.pmtiles"
        if not map_file.exists():
            # Write a lightweight binary file representing the PMTiles container
            map_file.write_bytes(b"PMTilesMockDataHeader1234567890")
            print(f"[ok] Created mock map: {map_file}")
        else:
            print(f"[ok] Map already exists: {map_file}")

if __name__ == "__main__":
    main()
