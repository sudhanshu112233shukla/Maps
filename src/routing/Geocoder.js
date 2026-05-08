const CATEGORY_ALIASES = {
  gas: 'fuel',
  petrol: 'fuel',
  fuel: 'fuel',
  station: 'fuel',
  charging: 'charging',
  charger: 'charging',
  ev: 'charging',
  food: 'restaurant',
  cafe: 'restaurant',
  coffee: 'restaurant',
  stay: 'hotel',
  motel: 'hotel',
  doctor: 'hospital',
  emergency: 'hospital',
  medicine: 'pharmacy',
  chemist: 'pharmacy',
  toilet: 'rest_area',
  restroom: 'rest_area',
  service: 'rest_area',
};

const DEMO_POIS = [
  { name: 'Gateway of India', type: 'landmark', emoji: '📍', lng: 72.8347, lat: 18.922, region: 'india', keywords: ['mumbai', 'tourist'] },
  { name: 'Taj Mahal Palace', type: 'hotel', emoji: '🏨', lng: 72.8333, lat: 18.9217, region: 'india', keywords: ['mumbai', 'stay'] },
  { name: 'Indian Oil Colaba Fuel Station', type: 'fuel', emoji: '⛽', lng: 72.8311, lat: 18.9248, region: 'india', keywords: ['petrol', 'gas', 'diesel'] },
  { name: 'Tata Power EV Charging Hub', type: 'charging', emoji: '🔌', lng: 72.8403, lat: 18.9355, region: 'india', keywords: ['ev', 'charger'] },
  { name: 'Fortis Hospital Mumbai', type: 'hospital', emoji: '🏥', lng: 72.8421, lat: 19.0596, region: 'india', keywords: ['emergency', 'clinic'] },
  { name: 'Apollo Pharmacy Colaba', type: 'pharmacy', emoji: '💊', lng: 72.8338, lat: 18.9231, region: 'india', keywords: ['medicine', 'chemist'] },
  { name: 'Expressway Food Plaza Lonavala', type: 'rest_area', emoji: '🛣️', lng: 73.4201, lat: 18.7546, region: 'india', keywords: ['rest', 'washroom', 'service'] },
  { name: 'Mumbai, India', type: 'city', emoji: '🏙️', lng: 72.8777, lat: 18.9667, region: 'india', keywords: ['city'] },
  { name: 'Delhi, India', type: 'city', emoji: '🏙️', lng: 77.1025, lat: 28.7041, region: 'india', keywords: ['city'] },
  { name: 'Bangalore, India', type: 'city', emoji: '🏙️', lng: 77.5946, lat: 12.9716, region: 'india', keywords: ['city'] },
  { name: 'Pune, India', type: 'city', emoji: '🏙️', lng: 73.8567, lat: 18.5204, region: 'india', keywords: ['city'] },
  { name: 'Shell Interstate Travel Center', type: 'fuel', emoji: '⛽', lng: -97.5164, lat: 35.4676, region: 'usa', keywords: ['truck stop', 'gas', 'diesel'] },
  { name: 'Motel 6 Oklahoma City', type: 'hotel', emoji: '🏨', lng: -97.5082, lat: 35.4724, region: 'usa', keywords: ['stay', 'motel'] },
  { name: 'Tesla Supercharger Shinjuku', type: 'charging', emoji: '🔌', lng: 139.7004, lat: 35.6899, region: 'japan', keywords: ['ev', 'charger'] },
  { name: 'Tokyo Metropolitan Hospital', type: 'hospital', emoji: '🏥', lng: 139.733, lat: 35.7101, region: 'japan', keywords: ['emergency', 'clinic'] },
];

function haversine([lng1, lat1], [lng2, lat2]) {
  const radius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scorePoi(poi, query, canonicalCategory) {
  const loweredName = poi.name.toLowerCase();
  let score = 0;

  if (loweredName === query) score += 200;
  if (loweredName.startsWith(query)) score += 120;
  if (loweredName.includes(query)) score += 80;
  if (canonicalCategory && poi.type === canonicalCategory) score += 110;
  if (poi.keywords?.some((keyword) => keyword.includes(query) || query.includes(keyword))) {
    score += 60;
  }
  if (poi.type.includes(query)) score += 50;

  return score;
}

function normalizeCategory(query) {
  return CATEGORY_ALIASES[query] || query;
}

export class Geocoder {
  constructor(options = {}) {
    this.activeRegion = options.region || 'india';
    this.allowOnlineFallback = Boolean(options.allowOnlineFallback);
    this.cache = new Map();
  }

  setRegion(region) {
    this.activeRegion = region;
  }

  async search(query, limit = 6) {
    if (!query || query.trim().length < 2) return [];

    const normalizedQuery = query.toLowerCase().trim();
    const canonicalCategory = normalizeCategory(normalizedQuery);
    const cacheKey = `${this.activeRegion}:${normalizedQuery}:${limit}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const scoped = DEMO_POIS.filter(
      (poi) => poi.region === this.activeRegion || poi.type === 'city',
    );

    const localResults = scoped
      .map((poi) => ({ poi, score: scorePoi(poi, normalizedQuery, canonicalCategory) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ poi }) => ({
        ...poi,
        fullName: `${poi.name}`,
      }));

    if (localResults.length > 0 || !this.allowOnlineFallback || !navigator.onLine) {
      this.cache.set(cacheKey, localResults);
      return localResults;
    }

    this.cache.set(cacheKey, []);
    return [];
  }

  findNearby(type, origin, limit = 5) {
    if (!origin) return [];

    const canonicalType = normalizeCategory(type.toLowerCase());

    return DEMO_POIS
      .filter((poi) => poi.region === this.activeRegion && poi.type === canonicalType)
      .map((poi) => ({
        ...poi,
        distance: Math.round(haversine([origin.lng, origin.lat], [poi.lng, poi.lat])),
        fullName: poi.name,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }

  async reverseGeocode(lng, lat) {
    const nearest = DEMO_POIS
      .map((poi) => ({
        poi,
        distance: haversine([lng, lat], [poi.lng, poi.lat]),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearest && nearest.distance < 1500) {
      return nearest.poi.name;
    }

    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
