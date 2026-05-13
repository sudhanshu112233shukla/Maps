import { getRegionById } from './offlineRegions.js';

async function assertOk(response, path) {
  if (!response.ok) {
    throw new Error(`Resource unavailable (${response.status}) for ${path}`);
  }
}

export class RegionProvisioner {
  constructor(options = {}) {
    this.offlineDataLoader = options.offlineDataLoader || null;
  }

  async provisionRegion(regionId, progressCallback = null) {
    const region = getRegionById(regionId);
    if (!region) {
      throw new Error(`Unknown region: ${regionId}`);
    }

    const steps = [
      {
        key: 'pack',
        weight: 35,
        label: 'Verifying map pack',
        run: () => this.#verifyMapPack(region.bundledPackPath),
      },
      {
        key: 'graph',
        weight: 40,
        label: 'Verifying route graph',
        run: () => this.#verifyGraph(region.graphPath),
      },
      {
        key: 'poi',
        weight: 25,
        label: 'Verifying place index',
        run: () => this.#verifyPoi(region.poiPath),
      },
    ].filter((step) => step.run);

    let completedWeight = 0;
    progressCallback?.(2, 'Starting region provisioning');

    for (const step of steps) {
      progressCallback?.(Math.max(2, Math.round(completedWeight)), step.label);
      await step.run();
      completedWeight += step.weight;
      progressCallback?.(Math.min(99, Math.round(completedWeight)), `${step.label} complete`);
    }

    if (this.offlineDataLoader) {
      this.offlineDataLoader.clear(regionId);
      await this.offlineDataLoader.loadRegionAssets(regionId, {
        graphFallback: null,
        poiFallback: [],
      });
    }

    progressCallback?.(100, 'Region ready for offline use');
    return {
      packPath: region.bundledPackPath || null,
      graphPath: region.graphPath || null,
      poiPath: region.poiPath || null,
      dataVersion: region.dataVersion || 'unversioned',
      verifiedAt: new Date().toISOString(),
    };
  }

  async #verifyMapPack(packPath) {
    if (!packPath) {
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

  async #verifyGraph(graphPath) {
    if (!graphPath) {
      return;
    }

    const response = await fetch(graphPath, { cache: 'no-store' });
    await assertOk(response, graphPath);
    const graph = await response.json();
    if (!graph?.nodes || !graph?.edges) {
      throw new Error(`Invalid graph payload for ${graphPath}`);
    }
  }

  async #verifyPoi(poiPath) {
    if (!poiPath) {
      return;
    }

    const response = await fetch(poiPath, { cache: 'no-store' });
    await assertOk(response, poiPath);
    const poi = await response.json();
    if (!Array.isArray(poi)) {
      throw new Error(`Invalid POI payload for ${poiPath}`);
    }
  }
}
