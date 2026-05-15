import {
  findAssetInManifest,
  loadDeltaManifest,
  loadPackManifest,
  validateDeltaManifest,
  verifyAssetChecksum,
} from './PackIntegrity.js';
import { Capacitor } from '@capacitor/core';
import { OfflinePackStorage } from './OfflinePackStorage.js';
import { DownloadQueue } from './DownloadQueue.js';

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
    this.lastTransactionIdByRegion = new Map();
    const defaultConcurrent = Capacitor.isNativePlatform() ? 1 : 2;
    this.downloadQueue =
      options.downloadQueue ||
      new DownloadQueue({ maxConcurrent: Number.isFinite(options.maxConcurrent) ? options.maxConcurrent : defaultConcurrent });
  }

  async updateRegion(region, progressCallback = null, options = {}) {
    const priority = Number.isFinite(options.priority) ? options.priority : 0;
    const queueKey = `region:${region.id}`;
    return this.downloadQueue.enqueue(
      queueKey,
      ({ signal, isCancelled }) => this.#updateRegionInternal(region, progressCallback, { signal, isCancelled }),
      { priority },
    );
  }

  pauseRegion(regionId) {
    this.downloadQueue.pause(`region:${regionId}`);
    this.offlineStore?.updateTransaction?.(regionId, { transactionPaused: true }).catch?.(() => null);
  }

  resumeRegion(regionId) {
    this.downloadQueue.resume(`region:${regionId}`);
    this.offlineStore?.updateTransaction?.(regionId, { transactionPaused: false }).catch?.(() => null);
  }

  cancelRegion(regionId) {
    this.downloadQueue.cancel(`region:${regionId}`);
    this.offlineStore?.updateTransaction?.(regionId, { transactionCancelled: true }).catch?.(() => null);
  }

  async #updateRegionInternal(region, progressCallback, controls) {
    const manifest = await loadPackManifest(region.id);
    if (!manifest) {
      throw new Error(`Pack manifest not found for region ${region.id}`);
    }
    const deltaManifest = await loadDeltaManifest(region.id);
    const deltaValidation = validateDeltaManifest(deltaManifest, manifest);
    const regionStatus = this.offlineStore?.getRegionStatus?.(region.id) || null;
    const installedVersion = regionStatus?.dataVersion || region.dataVersion;
    const useDelta =
      deltaValidation.valid &&
      deltaManifest.baseVersion === installedVersion &&
      deltaManifest.dataVersion === manifest.dataVersion;

    const canResumeTransaction =
      regionStatus?.transactionId &&
      ['download', 'verify', 'activate'].includes(regionStatus.transactionStatus) &&
      regionStatus.transactionDataVersion === manifest.dataVersion;
    const transactionId = canResumeTransaction ? regionStatus.transactionId : `${region.id}-${Date.now()}`;
    this.lastTransactionIdByRegion.set(region.id, transactionId);

    await this.#setTransaction(region.id, transactionId, 'download', manifest.dataVersion);
    if (deltaManifest && !deltaValidation.valid) {
      await this.offlineStore?.updateTransaction(region.id, {
        transactionChunkStatus: 'delta-invalid',
        transactionChunkError: `Delta manifest ignored: ${deltaValidation.reason}`,
      });
    }
    progressCallback?.(10, useDelta ? 'Downloading delta assets' : 'Downloading pack assets');
    const staged = useDelta
      ? await this.packStorage.stageDeltaAssets(
          region.id,
          transactionId,
          manifest,
          deltaManifest,
          async (details) => {
            const bounded = Math.max(0, Math.min(1, details?.fraction ?? 0));
            progressCallback?.(10 + Math.round(bounded * 35), 'Downloading delta assets');
            await this.offlineStore?.updateTransaction(region.id, {
              transactionAssetPath: details?.assetPath || null,
              transactionDownloadedBytes: Number.isFinite(details?.downloadedBytes)
                ? details.downloadedBytes
                : null,
              transactionTotalBytes: Number.isFinite(details?.totalBytes) ? details.totalBytes : null,
              transactionRetryCount: Number.isFinite(details?.retryCount) ? details.retryCount : 0,
              transactionChunkStatus: details?.status || null,
              transactionChunkError: details?.lastError || null,
              transactionEtaSeconds: Number.isFinite(details?.etaSeconds) ? details.etaSeconds : null,
              transactionBytesPerSecond: Number.isFinite(details?.bytesPerSecond) ? details.bytesPerSecond : null,
            });
          },
          {
            signal: controls?.signal || null,
            shouldPause: () => this.downloadQueue.pausedKeys?.has?.(`region:${region.id}`),
          },
        )
      : await this.packStorage.stageAssets(region.id, transactionId, manifest, async (details) => {
          const bounded = Math.max(0, Math.min(1, details?.fraction ?? 0));
          progressCallback?.(10 + Math.round(bounded * 35), 'Downloading pack assets');
          await this.offlineStore?.updateTransaction(region.id, {
            transactionAssetPath: details?.assetPath || null,
            transactionDownloadedBytes: Number.isFinite(details?.downloadedBytes)
              ? details.downloadedBytes
              : null,
            transactionTotalBytes: Number.isFinite(details?.totalBytes) ? details.totalBytes : null,
            transactionRetryCount: Number.isFinite(details?.retryCount) ? details.retryCount : 0,
            transactionChunkStatus: details?.status || null,
            transactionChunkError: details?.lastError || null,
            transactionEtaSeconds: Number.isFinite(details?.etaSeconds) ? details.etaSeconds : null,
            transactionBytesPerSecond: Number.isFinite(details?.bytesPerSecond) ? details.bytesPerSecond : null,
          });
        }, {
          signal: controls?.signal || null,
          shouldPause: () => this.downloadQueue.pausedKeys?.has?.(`region:${region.id}`),
        });
    if (!this.packStorage.isNative()) {
      await this.#downloadAssets(manifest, useDelta ? deltaManifest : null);
    }

    await this.#setTransaction(region.id, transactionId, 'verify', manifest.dataVersion);
    progressCallback?.(45, 'Verifying pack checksums');
    await this.packStorage.verifyStagedAssets(staged.stagedAssets);
    await this.#verifyAssets(manifest);

    await this.#setTransaction(region.id, transactionId, 'activate', manifest.dataVersion);
    progressCallback?.(80, 'Activating pack transaction');
    const activation = await this.packStorage.activateStagedRegion(
      region.id,
      transactionId,
      staged.stagedAssets,
      staged.stageDir,
    );
    const patch = this.#buildActivationPatch(region, manifest, activation.assets);
    this.lastRollbackTokenByRegion.set(region.id, activation.rollbackToken);
    await this.#setTransaction(region.id, transactionId, 'completed', null);

    progressCallback?.(100, 'Pack transaction completed');
    return patch;
  }

  async rollbackRegion(regionId, previousActive, reason = 'Activation failed') {
    const rollbackToken = this.lastRollbackTokenByRegion.get(regionId) || null;
    const transactionId = this.lastTransactionIdByRegion.get(regionId) || previousActive?.transactionId || null;
    await this.packStorage.rollbackActivation(rollbackToken);
    await this.packStorage.clearTransactionState(regionId, transactionId);
    this.lastRollbackTokenByRegion.delete(regionId);
    this.lastTransactionIdByRegion.delete(regionId);
    await this.offlineStore?.updateTransaction(regionId, {
      transactionStatus: 'rollback',
      transactionError: reason,
      transactionDataVersion: null,
      transactionAssetPath: null,
      transactionDownloadedBytes: null,
      transactionTotalBytes: null,
      transactionRetryCount: null,
      transactionChunkStatus: null,
      transactionChunkError: null,
      transactionEtaSeconds: null,
      transactionBytesPerSecond: null,
      transactionPaused: false,
      transactionCancelled: false,
    });
    return {
      ...previousActive,
      rollbackAt: new Date().toISOString(),
    };
  }

  async finalizeRegion(regionId) {
    const rollbackToken = this.lastRollbackTokenByRegion.get(regionId) || null;
    const regionStatus = this.offlineStore?.getRegionStatus?.(regionId) || null;
    const transactionId = this.lastTransactionIdByRegion.get(regionId) || regionStatus?.transactionId || null;
    await this.packStorage.finalizeActivation(rollbackToken);
    await this.packStorage.clearTransactionState(regionId, transactionId);
    this.lastRollbackTokenByRegion.delete(regionId);
    this.lastTransactionIdByRegion.delete(regionId);
  }

  async #downloadAssets(manifest, deltaManifest = null) {
    const patchByPath = new Map((deltaManifest?.patchAssets || []).map((asset) => [asset.path, asset]));
    const deletedPaths = new Set(deltaManifest?.deleteAssets || []);
    for (const asset of manifest.assets || []) {
      if (deletedPaths.has(asset.path)) {
        continue;
      }
      if (asset.required === false) {
        continue;
      }
      const patchAsset = patchByPath.get(asset.path);
      await fetchRequiredAsset(patchAsset?.path || asset.path);
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
      updateType: activatedAssets.length > 0 ? 'delta-or-full' : 'full',
      activatedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    };
  }

  async #setTransaction(regionId, transactionId, transactionStatus, transactionDataVersion = null) {
    await this.offlineStore?.updateTransaction(regionId, {
      transactionId,
      transactionStatus,
      transactionError: null,
      transactionDataVersion,
      transactionAssetPath: null,
      transactionDownloadedBytes: null,
      transactionTotalBytes: null,
      transactionRetryCount: null,
      transactionChunkStatus: null,
      transactionChunkError: null,
      transactionEtaSeconds: null,
      transactionBytesPerSecond: null,
      transactionPaused: false,
      transactionCancelled: false,
      transactionUpdatedAt: new Date().toISOString(),
    });
  }
}
