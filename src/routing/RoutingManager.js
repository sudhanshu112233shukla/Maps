import { GraphHopperBridge } from './GraphHopperBridge.js';
import { GraphPackRegistry } from '../packs/GraphPackRegistry.js';

export class RoutingManager {
  constructor({ fallbackRouter }) {
    this.fallbackRouter = fallbackRouter;
    this.gh = new GraphHopperBridge();
    this.backend = 'js-astar';
    this.graphPackRegistry = new GraphPackRegistry();
  }

  async loadGraph(graphData) {
    if (this.fallbackRouter?.loadGraph) {
      await this.fallbackRouter.loadGraph(graphData);
    }
  }

  async prepareRegion({ regionId, graphhopperDir = null }) {
    const activePack = await this.graphPackRegistry.get(regionId);
    const resolvedGraphDir = graphhopperDir || activePack?.graphhopperDir || null;
    const status = await this.gh.prepare({ regionId, graphDir: resolvedGraphDir });
    this.backend = status?.nativeAvailable && status?.prepared ? 'graphhopper-native' : 'js-astar';
    return {
      graphPackLoaded: Boolean(resolvedGraphDir),
      backend: this.backend,
      nativeAvailable: Boolean(status?.nativeAvailable),
      prepared: Boolean(status?.prepared),
    };
  }

  getStatus() {
    return {
      backend: this.backend,
      nativeAvailable: this.gh.nativeAvailable,
      prepared: this.gh.prepared,
      latencyMs: this.gh.lastLatencyMs,
      graphPackLoaded: Boolean(this.gh.lastGraphDir),
    };
  }

  async routeLatLng(startLng, startLat, endLng, endLat, mode = 'fastest') {
    const profile = 'car';

    if (this.backend === 'graphhopper-native') {
      const route = await this.gh.route({
        startLng,
        startLat,
        endLng,
        endLat,
        profile,
        locale: 'en',
      });
      if (route) return route;
      this.backend = 'js-astar';
    }

    if (!this.fallbackRouter?.routeLatLng) return null;
    return this.fallbackRouter.routeLatLng(startLng, startLat, endLng, endLat, mode);
  }

  generateInstructions(path, coords) {
    if (this.backend === 'graphhopper-native') {
      return [];
    }
    return this.fallbackRouter?.generateInstructions?.(path, coords) || [];
  }
}