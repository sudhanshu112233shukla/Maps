import { readFile } from 'node:fs/promises';
import { validateDeltaManifest } from '../../src/offline/PackIntegrity.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

async function run() {
  const manifest = JSON.parse(await readFile('./public/data/packs/india.manifest.json', 'utf8'));
  const delta = JSON.parse(await readFile('./public/data/packs/india.delta.json', 'utf8'));
  const valid = validateDeltaManifest(delta, manifest);
  assert(valid.valid === true, `india delta should be valid (${valid.reason || 'unknown'})`);

  const invalidDelta = {
    ...delta,
    patchAssets: [{ path: '/data/graph/unknown.json' }],
  };
  const invalid = validateDeltaManifest(invalidDelta, manifest);
  assert(invalid.valid === false, 'invalid delta should fail validation');
}

run()
  .then(() => {
    process.stdout.write('[ok] delta manifest selfcheck: validation catches malformed patches\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] delta manifest selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
