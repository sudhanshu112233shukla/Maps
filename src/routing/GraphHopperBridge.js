import { registerPlugin } from '@capacitor/core';

const GraphHopperRouting = registerPlugin('GraphHopperRouting');

function normalizeInstruction(item = {}) {
  return {
    text: item.text || item.instruction || '',
    dist: Number.isFinite(item.dist) ? item.dist : Number(item.distance ?? 0),
    icon: item.icon || item.sign || 'straight',
  };
}

export class GraphHopperBridge {
  constructor() {
    this.nativeAvailable = false;
    this.prepared = false;
    this.lastRegionId = null;
    this.lastGraphDir = null;
    this.lastLatencyMs = null;
  }

  async prepare({ regionId, graphDir }) {
    try {
      const result = await GraphHopperRouting.prepare({ regionId, graphDir });
      this.nativeAvailable = Boolean(result?.nativeAvailable);
      this.prepared = Boolean(result?.prepared);
      this.lastRegionId = result?.regionId || regionId;
      this.lastGraphDir = result?.graphDir || graphDir;
      return {
        nativeAvailable: this.nativeAvailable,
        prepared: this.prepared,
      };
    } catch {
      this.nativeAvailable = false;
      this.prepared = false;
      return { nativeAvailable: false, prepared: false };
    }
  }

  async route({ startLng, startLat, endLng, endLat, profile = 'car', locale = 'en' }) {
    if (!this.nativeAvailable || !this.prepared) return null;

    try {
      const result = await GraphHopperRouting.route({
        startLng,
        startLat,
        endLng,
        endLat,
        profile,
        locale,
      });

      if (!result?.nativeAvailable || !result?.prepared || !result?.route) return null;

      this.lastLatencyMs = Number.isFinite(result.latencyMs) ? result.latencyMs : null;
      const route = result.route;
      const coords = Array.isArray(route.coords) ? route.coords : [];
      const instructions = Array.isArray(route.instructions)
        ? route.instructions.map(normalizeInstruction)
        : [];

      return {
        coords,
        distance: Number(route.distance ?? 0),
        duration: Number(route.duration ?? 0),
        instructions,
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: coords },
              properties: { distance: route.distance ?? 0, duration: route.duration ?? 0 },
            },
          ],
        },
      };
    } catch {
      return null;
    }
  }
}