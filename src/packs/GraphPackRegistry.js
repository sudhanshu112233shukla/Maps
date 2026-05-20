import { Preferences } from '@capacitor/preferences';

const ACTIVE_GRAPH_PACKS_KEY = 'melange-active-graph-packs-v1';

export class GraphPackRegistry {
  constructor() {
    this.cache = null;
  }

  async #load() {
    if (this.cache) return this.cache;
    const { value } = await Preferences.get({ key: ACTIVE_GRAPH_PACKS_KEY }).catch(() => ({ value: null }));
    this.cache = value ? JSON.parse(value) : {};
    return this.cache;
  }

  async #save(payload) {
    this.cache = payload;
    await Preferences.set({ key: ACTIVE_GRAPH_PACKS_KEY, value: JSON.stringify(payload) }).catch(() => null);
  }

  async get(regionId) {
    const all = await this.#load();
    return all[regionId] || null;
  }

  async set(regionId, record) {
    const all = await this.#load();
    all[regionId] = {
      regionId,
      graphhopperDir: record?.graphhopperDir || null,
      graphVersion: record?.graphVersion || null,
      graphhopperVersion: record?.graphhopperVersion || null,
      activatedAt: record?.activatedAt || new Date().toISOString(),
      fallbackActive: Boolean(record?.fallbackActive),
    };
    await this.#save(all);
    return all[regionId];
  }

  async remove(regionId) {
    const all = await this.#load();
    delete all[regionId];
    await this.#save(all);
  }
}