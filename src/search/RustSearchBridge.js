import { registerPlugin } from '@capacitor/core';

const RustSearch = registerPlugin('RustSearch');

function normalizeNativeResult(item = {}) {
  return {
    name: item.name || item.title || '',
    type: item.type || item.category || 'place',
    lng: Number(item.lng ?? item.lon ?? item.longitude ?? 0),
    lat: Number(item.lat ?? item.latitude ?? 0),
    region: item.region || item.regionId || 'unknown',
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    score: Number.isFinite(item.score) ? item.score : 0,
    fullName: item.fullName || item.name || item.title || '',
  };
}

export class RustSearchBridge {
  constructor() {
    this.nativeAvailable = false;
    this.prepared = false;
    this.lastRegionId = null;
    this.lastDataVersion = null;
    this.lastLatencyMs = null;
  }

  async prepareIndex({ regionId, graphPath, poiPath, dataVersion }) {
    try {
      const result = await RustSearch.prepareIndex({
        regionId,
        graphPath,
        poiPath,
        dataVersion,
      });

      this.nativeAvailable = Boolean(result?.nativeAvailable);
      this.prepared = Boolean(result?.prepared);
      this.lastRegionId = result?.regionId || regionId;
      this.lastDataVersion = result?.dataVersion || dataVersion || null;

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

  async search({ query, regionId, limit = 6, biasLng = null, biasLat = null }) {
    if (!this.nativeAvailable || !this.prepared) {
      return null;
    }

    try {
      const result = await RustSearch.search({
        query,
        regionId,
        limit,
        biasLng,
        biasLat,
      });

      if (!result?.nativeAvailable || !result?.prepared) {
        return null;
      }

      this.lastLatencyMs = Number.isFinite(result.latencyMs) ? result.latencyMs : null;
      const rows = Array.isArray(result.results) ? result.results : [];
      return rows.map(normalizeNativeResult);
    } catch {
      return null;
    }
  }
}
