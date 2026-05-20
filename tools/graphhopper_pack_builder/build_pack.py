from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_tree(root: Path) -> dict[str, str]:
    checksums: dict[str, str] = {}
    for file in sorted(root.rglob('*')):
        if file.is_file():
            checksums[str(file.relative_to(root)).replace('\\', '/')] = sha256_file(file)
    return checksums


def run(cmd: list[str], cwd: Path | None = None) -> None:
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def build_graphhopper_graph(java_bin: str, gh_jar: Path, osm_pbf: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        java_bin,
        '-jar',
        str(gh_jar),
        'import',
        str(osm_pbf),
        '--profiles=car,bike,foot',
        f'--graph.location={output_dir}',
    ]
    run(cmd)


def create_pack_zip(pack_root: Path, zip_path: Path) -> None:
    with ZipFile(zip_path, 'w', ZIP_DEFLATED) as zf:
        for file in sorted(pack_root.rglob('*')):
            if file.is_file() and file != zip_path:
                zf.write(file, file.relative_to(pack_root))


def build_pack(args: argparse.Namespace) -> Path:
    region_id = args.region_id
    out_root = Path(args.output_root).resolve()
    pack_dir = out_root / region_id
    graph_dir = pack_dir / 'graphhopper'
    checksums_dir = pack_dir / 'checksums'
    pack_dir.mkdir(parents=True, exist_ok=True)
    checksums_dir.mkdir(parents=True, exist_ok=True)

    osm_pbf = Path(args.osm_pbf).resolve()
    gh_jar = Path(args.graphhopper_jar).resolve()

    build_graphhopper_graph(args.java_bin, gh_jar, osm_pbf, graph_dir)

    tree_checksums = sha256_tree(pack_dir)
    (checksums_dir / 'checksums.json').write_text(json.dumps(tree_checksums, indent=2), encoding='utf-8')

    metadata = {
        'regionId': region_id,
        'graphVersion': args.graph_version,
        'graphhopperVersion': '9.0',
        'osmSource': args.osm_source,
        'osmDate': args.osm_date,
        'builtAtUtc': datetime.now(timezone.utc).isoformat(),
        'vehicleProfiles': ['car', 'bike', 'foot'],
        'localeSupport': args.locales.split(','),
        'packFormatVersion': 1,
    }
    (pack_dir / 'metadata.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')

    zip_path = pack_dir / 'pack.zip'
    create_pack_zip(pack_dir, zip_path)
    pack_checksum = sha256_file(zip_path)

    manifest = {
        'regionId': region_id,
        'graphVersion': args.graph_version,
        'graphhopperVersion': '9.0',
        'osmSource': args.osm_source,
        'osmDate': args.osm_date,
        'checksum': pack_checksum,
        'vehicleProfiles': ['car', 'bike', 'foot'],
        'localeSupport': args.locales.split(','),
        'packFormatVersion': 1,
        'bundlePath': 'pack.zip',
    }
    (pack_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    return pack_dir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Build production GraphHopper offline pack')
    parser.add_argument('--region-id', required=True)
    parser.add_argument('--osm-pbf', required=True)
    parser.add_argument('--graphhopper-jar', required=True)
    parser.add_argument('--output-root', default='packs')
    parser.add_argument('--graph-version', default='1.0.0')
    parser.add_argument('--osm-source', default='geofabrik')
    parser.add_argument('--osm-date', default=datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    parser.add_argument('--locales', default='en,hi')
    parser.add_argument('--java-bin', default='java')
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    pack_dir = build_pack(args)
    print(f'[ok] GraphHopper pack built at {pack_dir}')