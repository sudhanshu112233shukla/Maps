import { registerPlugin } from '@capacitor/core';

const GraphHopperRouting = registerPlugin('GraphHopperRouting');

function normalizeInstruction(step = {}) {
  return {
    text: step.text || step.instruction || '',
    dist: Number.isFinite(step.dist) ? step.dist : Number(step.distance ?? 0),
    icon: step.icon || 'straight',
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
      const status = await GraphHopperRouting.prepare({ regionId, graphDir });
      this.nativeAvailable = Boolean(status?.nativeAvailable);
      this.prepared = Boolean(status?.prepared);
      this.lastRegionId = status?.regionId || regionId || null;
      this.lastGraphDir = status?.graphDir || graphDir || null;
      return {
        nativeAvailable: this.nativeAvailable,
        prepared: this.prepared,
      };
    } catch {
      this.nativeAvailable = false;
      this.prepared = false;
      this.lastGraphDir = null;
      return {
        nativeAvailable: false,
        prepared: false,
      };
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

      if (!result?.prepared || !result?.route) return null;

      this.lastLatencyMs = Number.isFinite(result.latencyMs) ? result.latencyMs : null;
      const route = result.route;
      const coords = Array.isArray(route.coords) ? route.coords : [];
      const instructions = Array.isArray(route.instructions)
        ? route.instructions.map((step) => normalizeInstruction(step))
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
              geometry: {
                type: 'LineString',
                coordinates: coords,
              },
              properties: {
                distance: Number(route.distance ?? 0),
                duration: Number(route.duration ?? 0),
              },
            },
          ],
        },
      };
    } catch {
      return null;
    }
  }
}
