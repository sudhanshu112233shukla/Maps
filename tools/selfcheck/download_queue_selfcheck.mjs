import { setTimeout as sleep } from 'node:timers/promises';
import { DownloadQueue } from '../../src/offline/DownloadQueue.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

async function run() {
  const events = [];
  const queue = new DownloadQueue({
    maxConcurrent: 2,
    onStateChange: (snapshot) => events.push(snapshot),
  });

  const order = [];
  const makeTask = (name, ms = 50) => async ({ signal, isCancelled }) => {
    if (signal?.aborted) {
      throw new Error('aborted');
    }
    order.push(`start:${name}`);
    await sleep(ms);
    if (isCancelled?.()) {
      throw new Error('cancelled');
    }
    order.push(`end:${name}`);
    return name;
  };

  const pLow = queue.enqueue('low', makeTask('low', 80), { priority: 0 });
  const pHigh = queue.enqueue('high', makeTask('high', 30), { priority: 10 });
  const pMid = queue.enqueue('mid', makeTask('mid', 40), { priority: 5 });

  const results = await Promise.all([pLow, pHigh, pMid]);
  assert(results.includes('high') && results.includes('mid') && results.includes('low'), 'basic enqueue failed');

  // Pause/resume.
  queue.pause('paused');
  const pPaused = queue.enqueue('paused', makeTask('paused', 20), { priority: 100 });
  await sleep(60);
  assert(!order.some((entry) => entry.includes('paused')), 'paused task started unexpectedly');
  queue.resume('paused');
  await pPaused;
  assert(order.some((entry) => entry === 'start:paused'), 'paused task did not start after resume');

  // Cancel running work.
  const pCancel = queue.enqueue('cancel', makeTask('cancel', 200), { priority: 50 });
  await sleep(30);
  queue.cancel('cancel');
  let cancelled = false;
  try {
    await pCancel;
  } catch {
    cancelled = true;
  }
  assert(cancelled, 'cancel did not reject');

  // Cancel pending work.
  queue.pause('cancel-pending');
  const pCancelPending = queue.enqueue('cancel-pending', makeTask('cancel-pending', 20), { priority: 100 });
  queue.cancel('cancel-pending');
  let pendingCancelled = false;
  try {
    await pCancelPending;
  } catch (error) {
    pendingCancelled = error?.name === 'AbortError';
  }
  assert(pendingCancelled, 'pending cancel did not reject with AbortError');

  // Cancel must reject even if a task ignores the cancellation signal and resolves.
  const pIgnoreCancel = queue.enqueue(
    'ignore-cancel',
    async () => {
      await sleep(20);
      return 'ignored';
    },
    { priority: 50 },
  );
  await sleep(1);
  queue.cancel('ignore-cancel');
  let ignoredCancelled = false;
  try {
    await pIgnoreCancel;
  } catch (error) {
    ignoredCancelled = error?.name === 'AbortError';
  }
  assert(ignoredCancelled, 'ignored cancellation resolved instead of rejecting');

  // Concurrency never exceeds maxConcurrent in snapshots.
  const maxSeen = Math.max(...events.map((snapshot) => snapshot.runningCount));
  assert(maxSeen <= 2, `concurrency exceeded: ${maxSeen}`);

  return { order, maxSeen };
}

run()
  .then((result) => {
    process.stdout.write(`[ok] queue selfcheck: maxConcurrentSeen=${result.maxSeen}\n`);
  })
  .catch((error) => {
    process.stderr.write(`[fail] queue selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
