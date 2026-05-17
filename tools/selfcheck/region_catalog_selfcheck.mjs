import { readFile } from 'node:fs/promises';

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const catalog = JSON.parse(await readFile('./public/data/releases/catalog.json', 'utf8'));
  const regions = catalog.regions || [];

  assertCondition(Array.isArray(regions) && regions.length > 0, 'catalog must contain regions');

  for (const region of regions) {
    assertCondition(typeof region.regionId === 'string' && region.regionId.length > 0, 'regionId required');
    assertCondition(typeof region.releaseStatus === 'string', `releaseStatus required for ${region.regionId}`);
    assertCondition(region.assets?.graph?.path, `graph asset path required for ${region.regionId}`);
    assertCondition(region.assets?.poi?.path, `poi asset path required for ${region.regionId}`);
    assertCondition(region.assets?.packManifest?.exists, `pack manifest must exist for ${region.regionId}`);
    assertCondition(region.assets?.packDelta?.exists, `pack delta must exist for ${region.regionId}`);
  }

  process.stdout.write('[ok] region catalog selfcheck: release catalog structure validated\n');
}

main().catch((error) => {
  process.stderr.write(`[fail] region catalog selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
