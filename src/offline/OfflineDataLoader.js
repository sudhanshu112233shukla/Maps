import { getRegionById } from './offlineRegions.js';

async function loadJson(path) {
  const response = await fetch(path, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

export class OfflineDataLoader {
  constructor() {
    this.cache = new Map();
  }

  async loadRegionAssets(regionId, { graphFallback = null, poiFallback = [] } = {}) {
    if (this.cache.has(regionId)) {
      return this.cache.get(regionId);
    }

    const region = getRegionById(regionId);

    const [graph, pois] = await Promise.all([
      this.#loadGraph(region?.graphPath, graphFallback),
      this.#loadPois(region?.poiPath, poiFallback),
    ]);

    const payload = { graph, pois };
    this.cache.set(regionId, payload);
    return payload;
  }

  clear(regionId = null) {
    if (regionId) {
      this.cache.delete(regionId);
      return;
    }
    this.cache.clear();
  }

  async #loadGraph(graphPath, fallback) {
    if (!graphPath) return fallback;
    try {
      return await loadJson(graphPath);
    } catch {
      return fallback;
    }
  }

  async #loadPois(poiPath, fallback) {
    if (!poiPath) return fallback;
    try {
      const pois = await loadJson(poiPath);
      return Array.isArray(pois) ? pois : fallback;
    } catch {
      return fallback;
    }
  }
}
