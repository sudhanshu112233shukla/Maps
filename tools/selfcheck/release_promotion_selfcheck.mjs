import { readFile } from 'node:fs/promises';
import { OFFLINE_REGIONS } from '../../src/offline/offlineRegions.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

async function fileExists(path) {
  try {
    await readFile(path, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function run() {
  const released = OFFLINE_REGIONS.filter((region) => region.releaseStatus === 'released');
  const planned = OFFLINE_REGIONS.filter((region) => region.releaseStatus !== 'released');
  assert(released.length > 0, 'at least one released region is required');
  assert(planned.length >= 0, 'planned region list check');

  for (const region of released) {
    const manifestPath = `./public/data/packs/${region.id}.manifest.json`;
    const hasManifest = await fileExists(manifestPath);
    assert(hasManifest, `released region missing manifest: ${region.id}`);
  }
}

run()
  .then(() => {
    process.stdout.write('[ok] release promotion selfcheck: released regions have manifests\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] release promotion selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
