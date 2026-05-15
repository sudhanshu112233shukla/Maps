import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFLINE_REGIONS } from '../../src/offline/offlineRegions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const publicRoot = path.join(repoRoot, 'public');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

function publicPathToFile(publicPath) {
  assert(publicPath?.startsWith('/data/'), `Invalid public asset path: ${publicPath}`);
  return path.join(publicRoot, publicPath.slice(1));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function validateReleasedRegion(region) {
  const manifestPath = publicPathToFile(`/data/packs/${region.id}.manifest.json`);
  assert(await exists(manifestPath), `Missing manifest for released region: ${region.id}`);

  const manifest = await loadJson(manifestPath);
  assert(manifest.regionId === region.id, `Manifest regionId mismatch for ${region.id}`);
  assert(manifest.dataVersion === region.dataVersion, `Manifest dataVersion mismatch for ${region.id}`);
  assert(Array.isArray(manifest.assets) && manifest.assets.length > 0, `Manifest has no assets for ${region.id}`);

  const requiredPaths = new Set(manifest.assets.filter((asset) => asset.required !== false).map((asset) => asset.path));
  assert(requiredPaths.has(region.graphPath), `Manifest missing required graph asset for ${region.id}`);
  assert(requiredPaths.has(region.poiPath), `Manifest missing required POI asset for ${region.id}`);

  for (const asset of manifest.assets) {
    assert(asset.path?.startsWith('/data/'), `Asset must stay under /data for ${region.id}: ${asset.path}`);
    const filePath = publicPathToFile(asset.path);
    const fileExists = await exists(filePath);

    if (asset.required === false) {
      continue;
    }

    assert(fileExists, `Missing required asset for ${region.id}: ${asset.path}`);
    assert(asset.sha256, `Missing sha256 for required asset ${asset.path}`);
    const actualHash = await sha256(filePath);
    assert(
      actualHash.toLowerCase() === String(asset.sha256).toLowerCase(),
      `Checksum mismatch for ${asset.path}`,
    );
  }
}

async function validatePlannedRegion(region) {
  const manifestPath = publicPathToFile(`/data/packs/${region.id}.manifest.json`);
  if (!(await exists(manifestPath))) {
    return;
  }
  const manifest = await loadJson(manifestPath);
  assert(manifest.regionId === region.id, `Planned manifest regionId mismatch for ${region.id}`);
  assert(Array.isArray(manifest.assets), `Planned manifest assets invalid for ${region.id}`);
}

async function run() {
  const released = OFFLINE_REGIONS.filter((region) => region.releaseStatus === 'released');
  const planned = OFFLINE_REGIONS.filter((region) => region.releaseStatus !== 'released');
  assert(released.length > 0, 'At least one released region is required');

  for (const region of released) {
    await validateReleasedRegion(region);
  }
  for (const region of planned) {
    await validatePlannedRegion(region);
  }

  return { released: released.length, planned: planned.length };
}

run()
  .then(({ released, planned }) => {
    process.stdout.write(`[ok] pack manifest selfcheck: released=${released} planned=${planned}\n`);
  })
  .catch((error) => {
    process.stderr.write(`[fail] pack manifest selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
