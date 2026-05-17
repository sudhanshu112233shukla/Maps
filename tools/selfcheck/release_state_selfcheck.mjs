import { OFFLINE_REGIONS } from '../../src/offline/offlineRegions.js';
import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

async function run() {
  const manifest = JSON.parse(await readFile('./tools/osm_pipeline/region_manifest.json', 'utf8'));
  const enabledById = new Map(
    (manifest?.regions || [])
      .filter((region) => region?.id)
      .map((region) => [region.id, Boolean(region.enabled)]),
  );

  let previousPriority = -1;
  for (const region of OFFLINE_REGIONS) {
    assert(Number.isInteger(region.releasePriority), `missing releasePriority for ${region.id}`);
    assert(region.releasePriority > previousPriority, `releasePriority not strictly increasing at ${region.id}`);
    previousPriority = region.releasePriority;

    const enabled = enabledById.get(region.id);
    if (region.releaseStatus === 'released' || region.releaseStatus === 'in-progress') {
      assert(enabled === true, `${region.id} should be enabled in region manifest`);
    }
  }
}

run()
  .then(() => {
    process.stdout.write('[ok] release state selfcheck: region statuses and manifest enablement align\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] release state selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
