import { findAssetInManifest, loadPackManifest, verifyAssetChecksum } from './PackIntegrity.js';
import { OfflinePackStorage } from './OfflinePackStorage.js';

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
    this.packStorage = options.packStorage || new OfflinePackStorage();
    this.lastRollbackTokenByRegion = new Map();
  }

  async updateRegion(region, progressCallback = null) {
    const manifest = await loadPackManifest(region.id);
    if (!manifest) {
      throw new Error(`Pack manifest not found for region ${region.id}`);
    }

    const transactionId = `${region.id}-${Date.now()}`;

    await this.#setTransaction(region.id, transactionId, 'download');
    progressCallback?.(10, 'Downloading pack assets');
    const staged = await this.packStorage.stageAssets(region.id, transactionId, manifest);
    await this.#downloadAssets(manifest);

    await this.#setTransaction(region.id, transactionId, 'verify');
    progressCallback?.(45, 'Verifying pack checksums');
    await this.packStorage.verifyStagedAssets(staged.stagedAssets);
    await this.#verifyAssets(manifest);

    await this.#setTransaction(region.id, transactionId, 'activate');
    progressCallback?.(80, 'Activating pack transaction');
    const activation = await this.packStorage.activateStagedRegion(
      region.id,
      transactionId,
      staged.stagedAssets,
      staged.stageDir,
    );
    const patch = this.#buildActivationPatch(region, manifest, activation.assets);
    this.lastRollbackTokenByRegion.set(region.id, activation.rollbackToken);
    await this.#setTransaction(region.id, transactionId, 'completed');

    progressCallback?.(100, 'Pack transaction completed');
    return patch;
  }

  async rollbackRegion(regionId, previousActive, reason = 'Activation failed') {
    const rollbackToken = this.lastRollbackTokenByRegion.get(regionId) || null;
    await this.packStorage.rollbackActivation(rollbackToken);
    this.lastRollbackTokenByRegion.delete(regionId);
    await this.offlineStore?.updateTransaction(regionId, {
      transactionStatus: 'rollback',
      transactionError: reason,
    });
    return {
      ...previousActive,
      rollbackAt: new Date().toISOString(),
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

  #buildActivationPatch(region, manifest, activatedAssets = []) {
    const bySourcePath = new Map(activatedAssets.map((asset) => [asset.path, asset]));
    const graphAsset = bySourcePath.get(region.graphPath) || findAssetInManifest(manifest, region.graphPath);
    const poiAsset = bySourcePath.get(region.poiPath) || findAssetInManifest(manifest, region.poiPath);
    const packAsset =
      bySourcePath.get(region.bundledPackPath) || findAssetInManifest(manifest, region.bundledPackPath);

    return {
      packPath: packAsset?.activePath || packAsset?.path || region.bundledPackPath || null,
      graphPath: graphAsset?.activePath || graphAsset?.path || region.graphPath || null,
      poiPath: poiAsset?.activePath || poiAsset?.path || region.poiPath || null,
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
