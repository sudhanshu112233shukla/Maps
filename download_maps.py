#!/usr/bin/env python3
"""
Backward-compatible entrypoint for offline map data preparation.

This script now delegates to the OSM graph pipeline:
1) download region PBF from manifest
2) build routing graph JSON for enabled regions
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parent
    command = [
        "python",
        str(repo_root / "tools" / "osm_pipeline" / "build_from_manifest.py"),
    ]
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
