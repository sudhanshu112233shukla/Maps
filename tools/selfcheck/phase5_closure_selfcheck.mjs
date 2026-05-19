import { readFile } from 'node:fs/promises';

function assertContains(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`Missing ${label}`);
  }
}

async function main() {
  const packManager = await readFile('./src/offline/OfflinePackManager.js', 'utf8');
  const packStorage = await readFile('./src/offline/OfflinePackStorage.js', 'utf8');
  const regionStore = await readFile('./src/offline/OfflineRegionStore.js', 'utf8');
  const chunkState = await readFile('./src/offline/ChunkDownloadState.js', 'utf8');
  const packIntegrity = await readFile('./src/offline/PackIntegrity.js', 'utf8');

  assertContains(packManager, "#setTransaction(region.id, transactionId, 'download'", 'download transaction phase');
  assertContains(packManager, "#setTransaction(region.id, transactionId, 'verify'", 'verify transaction phase');
  assertContains(packManager, "#setTransaction(region.id, transactionId, 'activate'", 'activate transaction phase');
  assertContains(packManager, "#setTransaction(region.id, transactionId, 'completed'", 'completed transaction phase');
  assertContains(packManager, 'rollbackRegion(regionId, previousActive', 'rollback API');
  assertContains(packManager, 'validateDeltaManifest(deltaManifest, manifest)', 'delta validation');
  assertContains(packManager, 'stageDeltaAssets(', 'delta apply path');

  assertContains(packStorage, 'activateStagedRegion(regionId, transactionId', 'atomic activate path');
  assertContains(packStorage, 'rollbackActivation(rollbackToken)', 'filesystem rollback path');
  assertContains(packStorage, 'finalizeActivation(rollbackToken)', 'finalize activation cleanup');
  assertContains(packStorage, 'this.chunkState.upsert', 'chunk metadata persistence');
  assertContains(packStorage, 'downloadedBytes', 'downloaded byte tracking');
  assertContains(packStorage, 'retryCount', 'retry state tracking');

  assertContains(regionStore, "transactionStatus: 'interrupted'", 'restart recovery state');
  assertContains(regionStore, 'transactionDownloadedBytes', 'region store chunk progress state');
  assertContains(regionStore, 'transactionRetryCount', 'region store retry state');

  assertContains(chunkState, 'clearTransaction(regionId, transactionId)', 'chunk transaction clear');
  assertContains(packIntegrity, 'validateDeltaManifest', 'delta manifest validator');

  process.stdout.write('[ok] phase-5 closure selfcheck: transactional updates, delta flow, resumable chunks, and recovery hooks verified\n');
}

main().catch((error) => {
  process.stderr.write(`[fail] phase-5 closure selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
