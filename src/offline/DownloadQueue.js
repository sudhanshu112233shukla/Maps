function stableNow() {
  return Date.now();
}

export class DownloadQueue {
  constructor(options = {}) {
    this.maxConcurrent = Number.isFinite(options.maxConcurrent) ? options.maxConcurrent : 2;
    this.runningCount = 0;
    this.queue = [];
    this.byKey = new Map();
    this.pausedKeys = new Set();
    this.onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;
  }

  getSnapshot() {
    const pending = this.queue.map((item) => ({
      key: item.key,
      priority: item.priority,
      enqueuedAt: item.enqueuedAt,
    }));
    const running = [];
    for (const [key, handle] of this.byKey.entries()) {
      if (handle.state === 'running') {
        running.push({ key, startedAt: handle.startedAt, priority: handle.priority });
      }
    }
    return {
      maxConcurrent: this.maxConcurrent,
      runningCount: this.runningCount,
      pausedKeys: [...this.pausedKeys],
      pending,
      running,
    };
  }

  pause(key) {
    if (!key) return;
    this.pausedKeys.add(key);
    this.#emit();
  }

  resume(key) {
    if (!key) return;
    this.pausedKeys.delete(key);
    this.#drain();
    this.#emit();
  }

  cancel(key) {
    if (!key) return;
    const handle = this.byKey.get(key);
    if (!handle) return;

    if (handle.state === 'pending') {
      this.queue = this.queue.filter((item) => item.key !== key);
      this.byKey.delete(key);
    } else if (handle.state === 'running') {
      handle.cancelRequested = true;
      try {
        handle.abortController?.abort();
      } catch {
        // ignore
      }
    }
    this.#emit();
  }

  enqueue(key, taskFactory, options = {}) {
    if (!key) {
      throw new Error('DownloadQueue.enqueue requires a key');
    }
    if (typeof taskFactory !== 'function') {
      throw new Error('DownloadQueue.enqueue requires a taskFactory function');
    }

    const existing = this.byKey.get(key);
    if (existing) {
      return existing.promise;
    }

    const priority = Number.isFinite(options.priority) ? options.priority : 0;
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

    const handle = {
      key,
      priority,
      enqueuedAt: stableNow(),
      startedAt: null,
      state: 'pending',
      cancelRequested: false,
      abortController,
      promise: null,
      resolve: null,
      reject: null,
      taskFactory,
    };

    handle.promise = new Promise((resolve, reject) => {
      handle.resolve = resolve;
      handle.reject = reject;
    });

    this.byKey.set(key, handle);
    this.queue.push(handle);
    this.queue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt);

    this.#drain();
    this.#emit();
    return handle.promise;
  }

  #emit() {
    this.onStateChange?.(this.getSnapshot());
  }

  #drain() {
    while (this.runningCount < this.maxConcurrent) {
      const nextIndex = this.queue.findIndex((item) => !this.pausedKeys.has(item.key));
      if (nextIndex === -1) {
        return;
      }

      const handle = this.queue.splice(nextIndex, 1)[0];
      if (!handle || handle.cancelRequested) {
        this.byKey.delete(handle?.key);
        continue;
      }

      this.runningCount += 1;
      handle.state = 'running';
      handle.startedAt = stableNow();

      const signal = handle.abortController?.signal || null;

      Promise.resolve()
        .then(() => handle.taskFactory({ signal, isCancelled: () => handle.cancelRequested }))
        .then((result) => {
          handle.state = 'completed';
          handle.resolve(result);
        })
        .catch((error) => {
          handle.state = handle.cancelRequested ? 'cancelled' : 'failed';
          handle.reject(error);
        })
        .finally(() => {
          this.runningCount = Math.max(0, this.runningCount - 1);
          this.byKey.delete(handle.key);
          this.#drain();
          this.#emit();
        });
    }
  }
}

