/**
 * Geocoder.js — Offline geocoding using Nominatim local data
 * Falls back to OpenStreetMap Nominatim API when online for demo
 * Production: replace with local Photon or Pelias instance
 */

// Demo POI data for testing (replace with local SQLite DB)
const DEMO_POIS = [
  { name: 'Gateway of India', type: 'landmark', emoji: '🏛️', lng: 72.8347, lat: 18.9220 },
  { name: 'Taj Mahal Palace', type: 'hotel', emoji: '🏨', lng: 72.8333, lat: 18.9217 },
  { name: 'Regal Cinema', type: 'landmark', emoji: '🎬', lng: 72.8322, lat: 18.9242 },
  { name: 'Colaba Causeway', type: 'shop', emoji: '🛍️', lng: 72.8315, lat: 18.9220 },
  { name: 'Mantralaya', type: 'government', emoji: '🏛️', lng: 72.8258, lat: 18.9298 },
  { name: 'Nariman Point', type: 'landmark', emoji: '🌊', lng: 72.8208, lat: 18.9250 },
  { name: 'Mumbai, India', type: 'city', emoji: '🏙️', lng: 72.8777, lat: 18.9667 },
  { name: 'Delhi, India', type: 'city', emoji: '🏙️', lng: 77.1025, lat: 28.7041 },
  { name: 'Bangalore, India', type: 'city', emoji: '🏙️', lng: 77.5946, lat: 12.9716 },
  { name: 'Pune, India', type: 'city', emoji: '🏙️', lng: 73.8567, lat: 18.5204 },
];

const REGION_BOUNDS = {
  india:  { minLng: 68, maxLng: 97, minLat: 8, maxLat: 37 },
  europe: { minLng: -10, maxLng: 40, minLat: 35, maxLat: 71 },
  usa:    { minLng: -125, maxLng: -67, minLat: 24, maxLat: 49 },
  japan:  { minLng: 129, maxLng: 145, minLat: 31, maxLat: 45 },
  korea:  { minLng: 125, maxLng: 130, minLat: 33, maxLat: 38 },
  russia: { minLng: 27, maxLng: 180, minLat: 41, maxLat: 82 },
  canada: { minLng: -141, maxLng: -52, minLat: 42, maxLat: 83 }
};

export class Geocoder {
  constructor() {
    this.activeRegion = 'india';
    this.cache = new Map();
  }

  setRegion(region) { this.activeRegion = region; }

  /**
   * Search for places matching the query
   * Uses local POI list + optionally Nominatim API
   */
  async search(query, limit = 6) {
    if (!query || query.trim().length < 2) return [];

    const q = query.toLowerCase().trim();
    const cacheKey = `${this.activeRegion}:${q}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    // Local search first
    const local = DEMO_POIS.filter(p =>
      p.name.toLowerCase().includes(q)
    ).slice(0, 3);

    // Try Nominatim API for richer results (online fallback)
    let remote = [];
    try {
      const bounds = REGION_BOUNDS[this.activeRegion];
      const url = bounds
        ? `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${bounds.minLng},${bounds.maxLat},${bounds.maxLng},${bounds.minLat}&bounded=0`
        : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;

      const resp = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'AIMapSystem/1.0' },
        signal: AbortSignal.timeout(3000)
      });

      if (resp.ok) {
        const data = await resp.json();
        remote = data.map(item => ({
          name: item.display_name.split(',').slice(0, 2).join(',').trim(),
          fullName: item.display_name,
          type: item.type,
          emoji: this._emojiForType(item.type, item.class),
          lng: parseFloat(item.lon),
          lat: parseFloat(item.lat)
        }));
      }
    } catch (e) {
      // Offline — use local results only
    }

    // Merge, deduplicate, limit
    const merged = [...local, ...remote]
      .filter((v, i, a) => a.findIndex(t => Math.abs(t.lng - v.lng) < 0.001 && Math.abs(t.lat - v.lat) < 0.001) === i)
      .slice(0, limit);

    this.cache.set(cacheKey, merged);
    return merged;
  }

  _emojiForType(type, cls) {
    const map = {
      city: '🏙️', town: '🏘️', village: '🏡',
      hospital: '🏥', pharmacy: '💊', restaurant: '🍽️',
      fuel: '⛽', hotel: '🏨', atm: '🏧',
      school: '🏫', university: '🎓', park: '🌳',
      museum: '🏛️', airport: '✈️', train_station: '🚂',
      bus_station: '🚌', supermarket: '🛒', bank: '🏦'
    };
    return map[type] || map[cls] || '📍';
  }

  async reverseGeocode(lng, lat) {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lon=${lng}&lat=${lat}&format=json`,
        { headers: { 'User-Agent': 'AIMapSystem/1.0' }, signal: AbortSignal.timeout(3000) }
      );
      if (resp.ok) {
        const data = await resp.json();
        return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    } catch (e) { /* offline */ }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
