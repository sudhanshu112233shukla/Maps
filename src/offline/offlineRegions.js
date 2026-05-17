export const OFFLINE_REGIONS = [
  {
    id: 'india',
    name: 'India',
    dataVersion: '2026.05',
    sizeLabel: '1.2 GB',
    viewport: { center: [78.9629, 20.5937], zoom: 4.5 },
    bounds: { minLng: 68, maxLng: 97, minLat: 8, maxLat: 37 },
    bundledPackPath: '/data/maps/india.pmtiles',
    graphPath: '/data/graph/india.json',
    poiPath: '/data/poi/india.json',
    automotiveFocus: 'NH corridors, fuel stops, hospitals, service plazas',
    releaseStatus: 'released',
    releasePriority: 0,
  },
  {
    id: 'usa',
    name: 'United States',
    dataVersion: '2026.05',
    sizeLabel: '4.5 GB',
    viewport: { center: [-95.7129, 37.0902], zoom: 3.5 },
    bounds: { minLng: -125, maxLng: -67, minLat: 24, maxLat: 49 },
    bundledPackPath: '/data/maps/usa.pmtiles',
    graphPath: '/data/graph/usa.json',
    poiPath: '/data/poi/usa.json',
    automotiveFocus: 'Interstates, truck stops, charging hubs, motels',
    releaseStatus: 'in-progress',
    releasePriority: 1,
  },
  {
    id: 'uk',
    name: 'United Kingdom',
    dataVersion: '2026.05',
    sizeLabel: '1.1 GB',
    viewport: { center: [-3.436, 55.3781], zoom: 5.2 },
    bounds: { minLng: -8.7, maxLng: 1.9, minLat: 49.8, maxLat: 60.9 },
    bundledPackPath: '/data/maps/uk.pmtiles',
    graphPath: '/data/graph/uk.json',
    poiPath: '/data/poi/uk.json',
    automotiveFocus: 'Motorways, service stations, parking, low-emission zones',
    releaseStatus: 'in-progress',
    releasePriority: 2,
  },
  {
    id: 'europe',
    name: 'Europe',
    dataVersion: '2026.05',
    sizeLabel: '8.2 GB',
    viewport: { center: [10.4515, 51.1657], zoom: 3.8 },
    bounds: { minLng: -10.5, maxLng: 31.5, minLat: 35.5, maxLat: 71.0 },
    bundledPackPath: '/data/maps/europe.pmtiles',
    graphPath: '/data/graph/europe.json',
    poiPath: '/data/poi/europe.json',
    automotiveFocus: 'Autobahn/autoroute, Schengen corridors, EV charging, tolls',
    releaseStatus: 'in-progress',
    releasePriority: 3,
  },
  {
    id: 'skorea',
    name: 'South Korea',
    dataVersion: '2026.05',
    sizeLabel: '420 MB',
    viewport: { center: [127.7669, 35.9078], zoom: 6 },
    bounds: { minLng: 125, maxLng: 130, minLat: 33, maxLat: 38 },
    bundledPackPath: '/data/maps/skorea.pmtiles',
    graphPath: '/data/graph/skorea.json',
    poiPath: '/data/poi/skorea.json',
    automotiveFocus: 'Expressways, tunnels, parking, EV charging',
    releaseStatus: 'in-progress',
    releasePriority: 4,
  },
  {
    id: 'japan',
    name: 'Japan',
    dataVersion: '2026.05',
    sizeLabel: '850 MB',
    viewport: { center: [138.2529, 36.2048], zoom: 5 },
    bounds: { minLng: 129, maxLng: 145, minLat: 31, maxLat: 45 },
    bundledPackPath: '/data/maps/japan.pmtiles',
    graphPath: '/data/graph/japan.json',
    poiPath: '/data/poi/japan.json',
    automotiveFocus: 'Expressways, urban parking, charging, rest areas',
    releaseStatus: 'planned',
    releasePriority: 5,
  },
  {
    id: 'russia',
    name: 'Russia',
    dataVersion: '2026.05',
    sizeLabel: '3.8 GB',
    viewport: { center: [105.3188, 61.524], zoom: 3 },
    bounds: { minLng: 27, maxLng: 180, minLat: 41, maxLat: 82 },
    bundledPackPath: '/data/maps/russia.pmtiles',
    graphPath: '/data/graph/russia.json',
    poiPath: '/data/poi/russia.json',
    automotiveFocus: 'Long-haul routing, fuel resilience, weather-critical corridors',
    releaseStatus: 'planned',
    releasePriority: 6,
  },
  {
    id: 'australia',
    name: 'Australia',
    dataVersion: '2026.05',
    sizeLabel: '950 MB',
    viewport: { center: [133.7751, -25.2744], zoom: 3.9 },
    bounds: { minLng: 112, maxLng: 154, minLat: -44, maxLat: -10 },
    bundledPackPath: '/data/maps/australia.pmtiles',
    graphPath: '/data/graph/australia.json',
    poiPath: '/data/poi/australia.json',
    automotiveFocus: 'Long-distance highways, remote fuel, emergency stops',
    releaseStatus: 'planned',
    releasePriority: 7,
  },
];

const DEFAULT_VIEWPORT = OFFLINE_REGIONS[0].viewport;

export function getRegionById(regionId) {
  return OFFLINE_REGIONS.find((region) => region.id === regionId) || null;
}

export function getRegionViewport(regionId) {
  return getRegionById(regionId)?.viewport || DEFAULT_VIEWPORT;
}

export function isRegionReleased(regionId) {
  return getRegionById(regionId)?.releaseStatus === 'released';
}

export function inferRegionFromCoordinates(lng, lat) {
  return OFFLINE_REGIONS.find((region) => {
    const bounds = region.bounds;
    return (
      lng >= bounds.minLng &&
      lng <= bounds.maxLng &&
      lat >= bounds.minLat &&
      lat <= bounds.maxLat
    );
  }) || null;
}
