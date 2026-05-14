import { Preferences } from '@capacitor/preferences';
import {
  OFFLINE_REGIONS,
  getRegionById,
  inferRegionFromCoordinates,
} from './offlineRegions.js';

const STORAGE_KEY = 'melange-offline-region-status-v1';
const DEFAULT_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];

function buildPackSource(packPath) {
  if (!packPath || !packPath.endsWith('.pmtiles')) return null;
  return {
    type: 'raster',
    url: `pmtiles://${packPath}`,
    attribution: 'Local PMTiles pack',
    offlineReady: true,
    packPath,
  };
}

export class OfflineRegionStore {
  constructor() {
    this.statusByRegion = {};
  }

  async hydrateRegions() {
    await this.#load();
    return this.getRegions();
  }

  getRegions() {
    return OFFLINE_REGIONS.map((region) => {
      const status = this.statusByRegion[region.id] || {};
      return {
        ...region,
        downloaded: Boolean(status.downloaded),
        progress: Number.isFinite(status.progress)
          ? status.progress
          : status.downloaded
            ? 100
            : 0,
        downloadedAt: status.downloadedAt || null,
        packPath: status.packPath || region.bundledPackPath,
        graphPath: status.graphPath || region.graphPath,
        poiPath: status.poiPath || region.poiPath,
        dataVersion: status.dataVersion || region.dataVersion || 'unversioned',
        verifiedAt: status.verifiedAt || null,
        stageKey: status.stageKey || null,
        stageStatus: status.stageStatus || null,
        stageProgress: Number.isFinite(status.stageProgress) ? status.stageProgress : null,
        lastError: status.lastError || null,
      };
    });
  }

  getSourceConfig(regionId) {
    const region = getRegionById(regionId);
    const status = this.statusByRegion[regionId] || {};
    const packPath = status.packPath || region?.bundledPackPath || null;
    const packSource = status.downloaded ? buildPackSource(packPath) : null;
    if (packSource) {
      return packSource;
    }

    return {
      name: status.downloaded ? 'local-pack-staged' : 'online-raster-fallback',
      type: 'raster',
      tiles: status.tiles || DEFAULT_TILES,
      attribution: status.downloaded
        ? 'Local pack staged. Add a compatible native/vector basemap style to render bundled PMTiles.'
        : 'OpenStreetMap contributors',
      offlineReady: Boolean(status.downloaded),
      packPath,
    };
  }

  inferRegionForPosition(lng, lat) {
    return inferRegionFromCoordinates(lng, lat);
  }

  async updateProgress(regionId, progress, patch = {}) {
    const current = this.statusByRegion[regionId] || {};
    const downloaded = progress >= 100;

    this.statusByRegion[regionId] = {
      ...current,
      ...patch,
      progress,
      downloaded,
      lastError: patch.lastError || null,
        downloadedAt:
          downloaded && !current.downloadedAt
            ? new Date().toISOString()
            : current.downloadedAt || null,
    };

    await this.#save();
    return this.getRegions();
  }

  async markDownloaded(regionId, patch = {}) {
    return this.updateProgress(regionId, 100, {
      ...patch,
      stageKey: null,
      stageStatus: 'completed',
      stageProgress: 100,
    });
  }

  async markFailed(regionId, reason) {
    const current = this.statusByRegion[regionId] || {};
    this.statusByRegion[regionId] = {
      ...current,
      downloaded: false,
      progress: 0,
      stageStatus: 'failed',
      lastError: reason || 'Provisioning failed',
    };
    await this.#save();
    return this.getRegions();
  }

  async updateStage(regionId, stageKey, stageStatus, stageProgress = null) {
    const current = this.statusByRegion[regionId] || {};
    this.statusByRegion[regionId] = {
      ...current,
      stageKey: stageKey || null,
      stageStatus: stageStatus || null,
      stageProgress: Number.isFinite(stageProgress) ? stageProgress : null,
      lastError: null,
    };
    await this.#save();
    return this.getRegions();
  }

  async #load() {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      this.statusByRegion = value ? JSON.parse(value) : {};
    } catch {
      this.statusByRegion = {};
    }
  }

  async #save() {
    try {
      await Preferences.set({
        key: STORAGE_KEY,
        value: JSON.stringify(this.statusByRegion),
      });
    } catch {
      return;
    }
  }
}
