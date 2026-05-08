import { LRUCache } from '../utils/LRUCache.js';
import { normalizeSearchText } from '../search/SearchNormalizer.js';
import { OfflineSearchIndex } from '../search/OfflineSearchIndex.js';

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

const DEFAULT_POIS = [
  {
    name: 'Gateway of India',
    type: 'landmark',
    emoji: '[*]',
    lng: 72.8347,
    lat: 18.922,
    region: 'india',
    keywords: ['mumbai', 'tourist'],
  },
  {
    name: 'Prayagraj Junction',
    type: 'station',
    emoji: '[R]',
    lng: 81.8463,
    lat: 25.4358,
    region: 'india',
    keywords: ['allahabad', 'railway', 'station', 'junction'],
  },
  {
    name: 'Indian Oil Colaba Fuel Station',
    type: 'fuel',
    emoji: '[F]',
    lng: 72.8311,
    lat: 18.9248,
    region: 'india',
    keywords: ['petrol', 'gas', 'diesel'],
  },
  {
    name: 'Tata Power EV Charging Hub',
    type: 'charging',
    emoji: '[E]',
    lng: 72.8403,
    lat: 18.9355,
    region: 'india',
    keywords: ['ev', 'charger'],
  },
  {
    name: 'Fortis Hospital Mumbai',
    type: 'hospital',
    emoji: '[H]',
    lng: 72.8421,
    lat: 19.0596,
    region: 'india',
    keywords: ['emergency', 'clinic'],
  },
  {
    name: 'Apollo Pharmacy Colaba',
    type: 'pharmacy',
    emoji: '[P]',
    lng: 72.8338,
    lat: 18.9231,
    region: 'india',
    keywords: ['medicine', 'chemist'],
  },
  {
    name: 'Expressway Food Plaza Lonavala',
    type: 'rest_area',
    emoji: '[S]',
    lng: 73.4201,
    lat: 18.7546,
    region: 'india',
    keywords: ['rest', 'washroom', 'service'],
  },
  {
    name: 'Mumbai, India',
    type: 'city',
    emoji: '[C]',
    lng: 72.8777,
    lat: 18.9667,
    region: 'india',
    keywords: ['city'],
  },
  {
    name: 'Delhi, India',
    type: 'city',
    emoji: '[C]',
    lng: 77.1025,
    lat: 28.7041,
    region: 'india',
    keywords: ['city'],
  },
  {
    name: 'Bangalore, India',
    type: 'city',
    emoji: '[C]',
    lng: 77.5946,
    lat: 12.9716,
    region: 'india',
    keywords: ['city'],
  },
  {
    name: 'Pune, India',
    type: 'city',
    emoji: '[C]',
    lng: 73.8567,
    lat: 18.5204,
    region: 'india',
    keywords: ['city'],
  },
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

function normalizeCategory(categoryQuery = '') {
  const normalized = normalizeSearchText(categoryQuery);
  return CATEGORY_ALIASES[normalized] || normalized;
}

export class Geocoder {
  constructor(options = {}) {
    this.activeRegion = options.region || 'india';
    this.allowOnlineFallback = Boolean(options.allowOnlineFallback);
    this.cache = new LRUCache(350);
    this.points = [...DEFAULT_POIS];
    this.index = new OfflineSearchIndex();
    this.index.build(this.points);
  }

  setRegion(region) {
    this.activeRegion = region;
  }

  setDataset(points) {
    this.points = Array.isArray(points) && points.length > 0 ? points : [...DEFAULT_POIS];
    this.index.build(this.points);
    this.cache.clear();
  }

  async search(query, limit = 6) {
    if (!query || query.trim().length < 2) return [];

    const normalizedQuery = normalizeSearchText(query);
    const cacheKey = `${this.activeRegion}:${normalizedQuery}:${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const indexedResults = this.index.search(query, {
      limit: Math.max(limit * 3, 12),
      region: this.activeRegion,
    });

    const filtered = indexedResults
      .filter((poi) => poi.region === this.activeRegion || poi.type === 'city')
      .slice(0, limit);

    if (filtered.length > 0 || !this.allowOnlineFallback || !navigator.onLine) {
      this.cache.set(cacheKey, filtered);
      return filtered;
    }

    this.cache.set(cacheKey, []);
    return [];
  }

  findNearby(type, origin, limit = 5) {
    if (!origin) return [];
    const canonicalType = normalizeCategory(type);

    return this.points
      .filter((poi) => poi.region === this.activeRegion && poi.type === canonicalType)
      .map((poi) => ({
        ...poi,
        distance: Math.round(haversine([origin.lng, origin.lat], [poi.lng, poi.lat])),
        fullName: poi.name,
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit);
  }

  async reverseGeocode(lng, lat) {
    const nearest = this.points
      .map((poi) => ({
        poi,
        distance: haversine([lng, lat], [poi.lng, poi.lat]),
      }))
      .sort((left, right) => left.distance - right.distance)[0];

    if (nearest && nearest.distance < 1500) {
      return nearest.poi.name;
    }

    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
