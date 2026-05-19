import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const PUBLIC_ROOT = path.join(REPO_ROOT, 'public');
const OUT_DIR = path.join(PUBLIC_ROOT, 'data', 'releases');
const OUT_PATH = path.join(OUT_DIR, 'rc.lock.json');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function fileSha256(publicPath) {
  const resolved = path.join(PUBLIC_ROOT, publicPath.replace(/^\//, ''));
  const payload = await readFile(resolved);
  return sha256(payload);
}

function gitHead() {
  return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

async function main() {
  const head = gitHead();
  const generatedAtUtc = new Date().toISOString();

  const inputs = {
    catalog: '/data/releases/catalog.json',
    readiness: '/data/releases/readiness.json',
  };

  const packRegionIds = [
    'india',
    'usa',
    'uk',
    'europe',
    'skorea',
    'japan',
    'russia',
    'australia',
  ];

  const packs = {};
  for (const regionId of packRegionIds) {
    packs[regionId] = {
      manifest: `/data/packs/${regionId}.manifest.json`,
      delta: `/data/packs/${regionId}.delta.json`,
    };
  }

  const lock = {
    schemaVersion: 1,
    generatedAtUtc,
    gitHead: head,
    inputs: {},
    packs: {},
  };

  for (const [key, publicPath] of Object.entries(inputs)) {
    lock.inputs[key] = {
      path: publicPath,
      sha256: await fileSha256(publicPath),
    };
  }

  for (const [regionId, pack] of Object.entries(packs)) {
    lock.packs[regionId] = {
      manifest: {
        path: pack.manifest,
        sha256: await fileSha256(pack.manifest),
      },
      delta: {
        path: pack.delta,
        sha256: await fileSha256(pack.delta),
      },
    };
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  process.stdout.write(`[ok] release freeze: wrote ${path.relative(REPO_ROOT, OUT_PATH)} for ${head}\n`);
}

main().catch((error) => {
  process.stderr.write(`[fail] release freeze: ${error?.stack || error}\n`);
  process.exitCode = 1;
});

