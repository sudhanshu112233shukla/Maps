import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

async function run() {
  const budgets = JSON.parse(await readFile('./docs/performance_budgets.json', 'utf8'));

  assert(Array.isArray(budgets?.ciGates?.requiredDeviceClasses), 'missing ciGates.requiredDeviceClasses');
  assert(budgets?.budgets?.coldStartMs?.lowEnd > 0, 'missing coldStartMs.lowEnd');
  assert(budgets?.budgets?.searchP95Ms?.midRange > 0, 'missing searchP95Ms.midRange');
  assert(budgets?.budgets?.aiInference?.voiceCommandEndToEndMs?.highEnd > 0, 'missing ai voice budget');
  assert(budgets?.budgets?.offlinePack?.activateAtomicMs > 0, 'missing offline pack activate budget');
}

run()
  .then(() => {
    process.stdout.write('[ok] performance budget selfcheck: machine-readable budgets present\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] performance budget selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
