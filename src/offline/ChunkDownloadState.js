import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = 'melange-pack-chunk-state-v1';

async function loadAll() {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

async function saveAll(state) {
  try {
    await Preferences.set({
      key: STORAGE_KEY,
      value: JSON.stringify(state),
    });
  } catch {
    return;
  }
}

function keyFor(regionId, transactionId, assetPath) {
  return `${regionId}::${transactionId}::${assetPath}`;
}

export class ChunkDownloadState {
  async get(regionId, transactionId, assetPath) {
    const all = await loadAll();
    return all[keyFor(regionId, transactionId, assetPath)] || null;
  }

  async upsert(regionId, transactionId, assetPath, patch) {
    const all = await loadAll();
    const key = keyFor(regionId, transactionId, assetPath);
    const current = all[key] || {};
    all[key] = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await saveAll(all);
    return all[key];
  }

  async remove(regionId, transactionId, assetPath) {
    const all = await loadAll();
    delete all[keyFor(regionId, transactionId, assetPath)];
    await saveAll(all);
  }

  async clearTransaction(regionId, transactionId) {
    const all = await loadAll();
    const prefix = `${regionId}::${transactionId}::`;
    for (const key of Object.keys(all)) {
      if (key.startsWith(prefix)) {
        delete all[key];
      }
    }
    await saveAll(all);
  }
}
