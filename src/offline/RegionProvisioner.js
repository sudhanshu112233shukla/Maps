import { getRegionById, isRegionReleased } from './offlineRegions.js';
import {
  findAssetInManifest,
  loadPackManifest,
  verifyAssetChecksum,
} from './PackIntegrity.js';
import { OfflinePackManager } from './OfflinePackManager.js';

async function assertOk(response, path) {
  if (!response.ok) {
    throw new Error(`Resource unavailable (${response.status}) for ${path}`);
  }
}

export class RegionProvisioner {
  constructor(options = {}) {
    this.offlineDataLoader = options.offlineDataLoader || null;
    this.offlineStore = options.offlineStore || null;
    this.packManager = options.packManager || new OfflinePackManager({ offlineStore: this.offlineStore });
  }

  pauseRegion(regionId) {
    this.packManager?.pauseRegion?.(regionId);
  }

  resumeRegion(regionId) {
    this.packManager?.resumeRegion?.(regionId);
  }

  cancelRegion(regionId) {
    this.packManager?.cancelRegion?.(regionId);
  }

  async provisionRegion(regionId, progressCallback = null) {
    const region = getRegionById(regionId);
    if (!region) {
      throw new Error(`Unknown region: ${regionId}`);
    }
    if (!isRegionReleased(regionId)) {
      throw new Error(`Offline pack is not released yet for ${region.name}`);
    }

    const previousActive = {
      packPath: region.bundledPackPath || null,
      graphPath: region.graphPath || null,
      poiPath: region.poiPath || null,
      dataVersion: region.dataVersion || 'unversioned',
    };
    let patch = previousActive;

    try {
      patch = await this.packManager.updateRegion(region, progressCallback);
    } catch (error) {
      await this.packManager.rollbackRegion(regionId, previousActive, error?.message || 'Pack transaction failed');
      throw error;
    }

    const manifest = await loadPackManifest(regionId);
    const steps = [
      {
        key: 'pack',
        weight: 35,
        label: 'Verifying map pack',
        run: () => this.#verifyMapPack(patch.packPath, manifest),
      },
      {
        key: 'graph',
        weight: 40,
        label: 'Verifying route graph',
        run: () => this.#verifyGraph(patch.graphPath, manifest),
      },
      {
        key: 'poi',
        weight: 25,
        label: 'Verifying place index',
        run: () => this.#verifyPoi(patch.poiPath, manifest),
      },
    ].filter((step) => step.run);

    let completedWeight = 0;
    progressCallback?.(2, 'Starting region provisioning');

    for (const step of steps) {
      await this.offlineStore?.updateStage(regionId, step.key, 'running', Math.round(completedWeight));
      progressCallback?.(Math.max(2, Math.round(completedWeight)), step.label);
      await step.run();
      completedWeight += step.weight;
      await this.offlineStore?.updateStage(regionId, step.key, 'verified', Math.round(completedWeight));
      progressCallback?.(Math.min(99, Math.round(completedWeight)), `${step.label} complete`);
    }

    if (this.offlineDataLoader) {
      this.offlineDataLoader.clear(regionId);
      await this.offlineDataLoader.loadRegionAssets(regionId, {
        graphFallback: null,
        poiFallback: [],
      });
    }

    await this.packManager.finalizeRegion?.(regionId);
    progressCallback?.(100, 'Region ready for offline use');
    return {
      ...patch,
      verifiedAt: patch.verifiedAt || new Date().toISOString(),
    };
  }

  async #verifyMapPack(packPath, manifest) {
    if (!packPath) {
      return;
    }
    const manifestAsset = findAssetInManifest(manifest, packPath);
    if (manifestAsset?.sha256) {
      const valid = await verifyAssetChecksum(packPath, manifestAsset.sha256);
      if (!valid) {
        throw new Error(`Checksum mismatch for ${packPath}`);
      }
      return;
    }
    if (manifestAsset?.required === false) {
      return;
    }

    const headResponse = await fetch(packPath, {
      method: 'HEAD',
      cache: 'no-store',
    }).catch(() => null);

    if (headResponse?.ok) {
      return;
    }

    const probeResponse = await fetch(packPath, {
      method: 'GET',
      cache: 'no-store',
      headers: { Range: 'bytes=0-1023' },
    });
    await assertOk(probeResponse, packPath);
    await probeResponse.arrayBuffer();
  }

  async #verifyGraph(graphPath, manifest) {
    if (!graphPath) {
      return;
    }

    const response = await fetch(graphPath, { cache: 'no-store' });
    await assertOk(response, graphPath);
    const graph = await response.json();
    if (!graph?.nodes || !graph?.edges) {
      throw new Error(`Invalid graph payload for ${graphPath}`);
    }
    const manifestAsset = findAssetInManifest(manifest, graphPath);
    if (manifestAsset?.sha256) {
      const valid = await verifyAssetChecksum(graphPath, manifestAsset.sha256);
      if (!valid) {
        throw new Error(`Checksum mismatch for ${graphPath}`);
      }
    }
  }

  async #verifyPoi(poiPath, manifest) {
    if (!poiPath) {
      return;
    }

    const response = await fetch(poiPath, { cache: 'no-store' });
    await assertOk(response, poiPath);
    const poi = await response.json();
    if (!Array.isArray(poi)) {
      throw new Error(`Invalid POI payload for ${poiPath}`);
    }
    const manifestAsset = findAssetInManifest(manifest, poiPath);
    if (manifestAsset?.sha256) {
      const valid = await verifyAssetChecksum(poiPath, manifestAsset.sha256);
      if (!valid) {
        throw new Error(`Checksum mismatch for ${poiPath}`);
      }
    }
  }
}
