import { getRegionById } from './offlineRegions.js';

async function loadJson(path) {
  const response = await fetch(path, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

export class OfflineDataLoader {
  async loadRegionAssets(regionId, { graphFallback = null, poiFallback = [] } = {}) {
    const region = getRegionById(regionId);

    const [graph, pois] = await Promise.all([
      this.#loadGraph(region?.graphPath, graphFallback),
      this.#loadPois(region?.poiPath, poiFallback),
    ]);

    return { graph, pois };
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
