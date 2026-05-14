import { findAssetInManifest, loadPackManifest, verifyAssetChecksum } from './PackIntegrity.js';

async function fetchRequiredAsset(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Required asset unavailable (${response.status}) for ${path}`);
  }
  await response.arrayBuffer();
}

export class OfflinePackManager {
  constructor(options = {}) {
    this.offlineStore = options.offlineStore || null;
  }

  async updateRegion(region, progressCallback = null) {
    const manifest = await loadPackManifest(region.id);
    if (!manifest) {
      throw new Error(`Pack manifest not found for region ${region.id}`);
    }

    const transactionId = `${region.id}-${Date.now()}`;
    const previousActive = this.#snapshotRegion(region);

    await this.#setTransaction(region.id, transactionId, 'download');
    progressCallback?.(10, 'Downloading pack assets');
    await this.#downloadAssets(manifest);

    await this.#setTransaction(region.id, transactionId, 'verify');
    progressCallback?.(45, 'Verifying pack checksums');
    await this.#verifyAssets(manifest);

    await this.#setTransaction(region.id, transactionId, 'activate');
    progressCallback?.(80, 'Activating pack transaction');
    const patch = this.#buildActivationPatch(region, manifest);
    await this.#setTransaction(region.id, transactionId, 'completed');

    progressCallback?.(100, 'Pack transaction completed');
    return patch;
  }

  async rollbackRegion(regionId, previousActive, reason = 'Activation failed') {
    await this.offlineStore?.updateTransaction(regionId, {
      transactionStatus: 'rollback',
      transactionError: reason,
    });
    return {
      ...previousActive,
      rollbackAt: new Date().toISOString(),
    };
  }

  #snapshotRegion(region) {
    return {
      packPath: region.bundledPackPath || null,
      graphPath: region.graphPath || null,
      poiPath: region.poiPath || null,
      dataVersion: region.dataVersion || 'unversioned',
    };
  }

  async #downloadAssets(manifest) {
    for (const asset of manifest.assets || []) {
      if (asset.required === false) {
        continue;
      }
      await fetchRequiredAsset(asset.path);
    }
  }

  async #verifyAssets(manifest) {
    for (const asset of manifest.assets || []) {
      if (!asset.sha256) {
        continue;
      }
      const valid = await verifyAssetChecksum(asset.path, asset.sha256);
      if (!valid) {
        throw new Error(`Checksum mismatch for ${asset.path}`);
      }
    }
  }

  #buildActivationPatch(region, manifest) {
    const graphAsset = findAssetInManifest(manifest, region.graphPath);
    const poiAsset = findAssetInManifest(manifest, region.poiPath);
    const packAsset = findAssetInManifest(manifest, region.bundledPackPath);

    return {
      packPath: packAsset?.path || region.bundledPackPath || null,
      graphPath: graphAsset?.path || region.graphPath || null,
      poiPath: poiAsset?.path || region.poiPath || null,
      dataVersion: manifest.dataVersion || region.dataVersion || 'unversioned',
      manifestVersion: manifest.schemaVersion || 1,
      activatedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    };
  }

  async #setTransaction(regionId, transactionId, transactionStatus) {
    await this.offlineStore?.updateTransaction(regionId, {
      transactionId,
      transactionStatus,
      transactionError: null,
      transactionUpdatedAt: new Date().toISOString(),
    });
  }
}
