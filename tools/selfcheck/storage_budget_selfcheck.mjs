import {
  canFitStorage,
  estimateRequiredBytesFromAssets,
  formatBytes,
} from '../../src/offline/StorageBudget.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

function run() {
  const requiredBytes = estimateRequiredBytesFromAssets([
    { required: true, sizeBytes: 100 * 1024 * 1024 },
    { required: true, sizeBytes: 50 * 1024 * 1024 },
    { required: false, sizeBytes: 500 * 1024 * 1024 },
  ]);
  assert(requiredBytes === 150 * 1024 * 1024, 'required-byte estimate regression');

  const enough = canFitStorage(requiredBytes, 400 * 1024 * 1024);
  assert(enough.fits === true, 'storage fit false positive');

  const tight = canFitStorage(requiredBytes, 200 * 1024 * 1024);
  assert(tight.fits === false, 'storage fit false negative');
  assert(tight.thresholdBytes > requiredBytes, 'threshold safety margin missing');

  assert(formatBytes(1024) === '1.00 KB', 'formatBytes regression for KB');
}

try {
  run();
  process.stdout.write('[ok] storage budget selfcheck: preflight estimation and guard logic stable\n');
} catch (error) {
  process.stderr.write(`[fail] storage budget selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
}
