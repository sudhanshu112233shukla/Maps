import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

async function run() {
  const readiness = JSON.parse(await readFile('./public/data/releases/readiness.json', 'utf8'));
  const regions = Array.isArray(readiness?.regions) ? readiness.regions : [];
  assert(regions.length > 0, 'readiness report has no regions');

  const india = regions.find((item) => item.regionId === 'india');
  assert(india, 'india row missing in readiness report');
  assert(india.releaseReady === true, 'india should be release-ready');
}

run()
  .then(() => {
    process.stdout.write('[ok] release readiness report selfcheck: report present and stable\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] release readiness report selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
