import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/main.css';

import { MapView } from './map/MapView.js';
import { AStarRouter } from './routing/AStarRouter.js';
import { RoutingManager } from './routing/RoutingManager.js';
import { Geocoder } from './routing/Geocoder.js';
import { GPSTracker } from './gps/GPSTracker.js';
import { AIAssistant } from './ai/AIAssistant.js';
import { captureNavigationAudio } from './ai/audio/captureNavigationAudio.js';
import { OfflineRegionStore } from './offline/OfflineRegionStore.js';
import { OfflineDataLoader } from './offline/OfflineDataLoader.js';
import { RegionProvisioner } from './offline/RegionProvisioner.js';
import { registerServiceWorker } from './registerServiceWorker.js';
import { NavigationSession } from './navigation/NavigationSession.js';
const state = {
  activeRegion: 'india_goa',
  origin: null,
  destination: null,
  currentRoute: null,
  routeMode: 'fastest',
  isNavigating: false,
  aiHistory: [],
  offlineRegions: [],
  searchBackend: 'js-fallback',
  routingBackend: 'js-astar',
  setupReady: false,
  setupReason: 'Initializing offline system',
};

const mapView = new MapView('map');
const jsRouter = new AStarRouter({ vehicleProfile: 'automobile' });
const routing = new RoutingManager({ fallbackRouter: jsRouter });
const geocoder = new Geocoder({ allowOnlineFallback: false, region: 'india' });
const gps = new GPSTracker();
const ai = new AIAssistant({ locale: 'en-US' });
const offlineStore = new OfflineRegionStore();
const offlineDataLoader = new OfflineDataLoader();
const regionProvisioner = new RegionProvisioner({ offlineDataLoader, offlineStore });
function updateRuntimeBadge() {
  let badge = document.getElementById('runtime-health-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'runtime-health-badge';
    badge.style.position = 'fixed';
    badge.style.right = '12px';
    badge.style.bottom = '88px';
    badge.style.zIndex = '9999';
    badge.style.background = 'rgba(15,23,42,0.88)';
    badge.style.color = '#fff';
    badge.style.padding = '8px 10px';
    badge.style.borderRadius = '10px';
    badge.style.fontSize = '12px';
    badge.style.lineHeight = '1.3';
    badge.style.maxWidth = '220px';
    document.body.appendChild(badge);
  }

  const aiHealth = window.getAIHealth?.() || {};
  const navHealth = window.getNavigationHealth?.() || {};
  const melange = aiHealth.supportsNativeMelange ? 'Melange: Semantic' : 'Assistant: Local';
  const routingLabel = navHealth.routingBackend === 'graphhopper-native'
    ? 'Routing: GraphHopper'
    : 'Routing: Offline';
  const pack = navHealth.graphPackLoaded ? 'Pack: Ready' : 'Pack: Setup';
  badge.textContent = `${melange} | ${routingLabel} | ${pack}`;
}

function ensureSetupGate() {
  let gate = document.getElementById('setup-gate');
  if (!gate) {
    gate = document.createElement('div');
    gate.id = 'setup-gate';
    gate.style.position = 'fixed';
    gate.style.inset = '0';
    gate.style.zIndex = '10000';
    gate.style.background = 'rgba(2,6,23,0.94)';
    gate.style.color = '#fff';
    gate.style.display = 'flex';
    gate.style.alignItems = 'center';
    gate.style.justifyContent = 'center';
    gate.style.padding = '24px';
    gate.style.textAlign = 'center';
    gate.innerHTML = `
      <div style="max-width:420px;">
        <h2 style="margin:0 0 12px;font-size:24px;">Preparing Offline Navigation</h2>
        <p id="setup-gate-text" style="margin:0 0 16px;opacity:0.9;line-height:1.4;">Initializing...</p>
        <button id="setup-gate-open-manager" style="padding:10px 14px;border-radius:10px;border:none;background:#2563eb;color:#fff;font-weight:600;display:none;">Open Offline Manager</button>
      </div>
    `;
    document.body.appendChild(gate);
    const button = document.getElementById('setup-gate-open-manager');
    button?.addEventListener('click', () => window.openOfflineManager?.());
  }

  const reason = state.setupReason || 'Preparing offline runtime';
  const text = document.getElementById('setup-gate-text');
  if (text) text.textContent = reason;
  const button = document.getElementById('setup-gate-open-manager');
  if (button) button.style.display = state.setupReady ? 'none' : 'inline-block';
  gate.style.display = state.setupReady ? 'none' : 'flex';
}

function updateOfflineReadyBadge() {
  const badge = document.getElementById('offline-badge');
  if (!badge) return;
  const active = state.offlineRegions.find((region) => region.id === state.activeRegion) || null;
  const graphhopperActive = state.routingBackend === 'graphhopper-native';
  const offlineReady = Boolean(active?.downloaded && graphhopperActive);
  badge.classList.toggle('offline-state-ok', offlineReady);
  badge.classList.toggle('offline-state-fallback', !offlineReady);
  if (offlineReady) {
    badge.textContent = `Offline Ready ? ${active?.name || state.activeRegion} ? GraphHopper`;
  } else if (active?.downloaded) {
    badge.textContent = `Pack Ready ? ${active?.name || state.activeRegion} ? JS fallback`;
  } else {
    badge.textContent = `Offline not ready ? download ${active?.name || state.activeRegion}`;
  }
}
const navSession = new NavigationSession();
const searchInput = document.getElementById('search-input');
const originInput = document.getElementById('origin-input');
const destInput = document.getElementById('dest-input');
const suggestionsPanel = document.getElementById('suggestions-panel');
const suggestionsList = document.getElementById('suggestions-list');
const placePanel = document.getElementById('place-panel');
const routePanel = document.getElementById('route-panel');
const routePanelBox = document.getElementById('routing-panel');
const routeTime = document.getElementById('route-time');
const routeDistance = document.getElementById('route-distance');
const safetyBadge = document.getElementById('safety-badge');
const placeName = document.getElementById('sheet-place-name');
const placeSubtitle = document.getElementById('sheet-place-subtitle');
const turnList = document.getElementById('turn-by-turn-list');
const clearSearchBtn = document.getElementById('clear-search-btn');
const navHud = document.getElementById('nav-hud');
const hudDistance = document.getElementById('hud-distance');
const hudInstruction = document.getElementById('hud-instruction');
const hudTime = document.getElementById('hud-time');
const hudArrival = document.getElementById('hud-arrival');
const aiPanel = document.getElementById('ai-panel');
const aiMessages = document.getElementById('ai-messages');
const aiInput = document.getElementById('ai-input');
const aiLoadingOverlay = document.getElementById('ai-loading-overlay');
const aiProgressFill = document.getElementById('ai-progress-fill');
const aiLoadingText = document.getElementById('ai-loading-text');
const aiStatusDot = document.getElementById('ai-status-dot');
const aiProviderNote = document.getElementById('ai-provider-note');
const meshAlert = document.getElementById('mesh-alert');
const arModeButton = document.getElementById('ar-mode-btn');

let activeInput = searchInput;
let aiBootstrapped = false;
let activeSearchSequence = 0;

async function init() {
  state.offlineRegions = await offlineStore.hydrateRegions();
  await ensureBundledDemoRegionsReady();

  mapView.init(state.activeRegion, offlineStore.getSourceConfig(state.activeRegion));
  await syncRegionAssets(state.activeRegion, { recenter: false });

  await bootstrapLocation();
  setupSearchUI();
  setupQuickSearch();
  setupRouteUI();
  setupNavUI();
  setupAIPanel();
  setupOfflineManager();
  await ensureOfflineSetupReady();

  setupFABs();
  registerServiceWorker();
  setupHardwareTelemetry();

  gps.startWatching(handlePositionUpdate);
  setInterval(updateRuntimeBadge, 1500);
  updateRuntimeBadge();
}


async function ensureBundledDemoRegionsReady() {
  let changed = false;
  for (const region of state.offlineRegions) {
    if (region.downloaded || !region.bundledPackPath || !region.graphPath || !region.poiPath) {
      continue;
    }
    state.offlineRegions = await offlineStore.markDownloaded(region.id, {
      packPath: region.bundledPackPath,
      graphPath: region.graphPath,
      poiPath: region.poiPath,
      graphhopperDir: null,
      dataVersion: region.dataVersion || '2026.05',
      verifiedAt: new Date().toISOString(),
    });
    changed = true;
  }
  if (changed) {
    state.offlineRegions = await offlineStore.hydrateRegions();
  }
}

async function ensureOfflineSetupReady() {
  state.offlineRegions = await offlineStore.hydrateRegions();
  const active = state.offlineRegions.find((region) => region.id === state.activeRegion);
  if (!active) return;

  if (active.downloaded) {
    state.setupReady = true;
    state.setupReason = '';
    ensureSetupGate();
    return;
  }

  const hasBundledFallback = Boolean(active.bundledPackPath && active.graphPath && active.poiPath);
  if (hasBundledFallback) {
    state.setupReason = `Activating bundled offline data for ${active.name || state.activeRegion}`;
    ensureSetupGate();
    state.offlineRegions = await offlineStore.markDownloaded(state.activeRegion, {
      packPath: active.bundledPackPath,
      graphPath: active.graphPath,
      poiPath: active.poiPath,
      graphhopperDir: null,
      dataVersion: active.dataVersion || '2026.05',
      verifiedAt: new Date().toISOString(),
    });
    await syncRegionAssets(state.activeRegion, { recenter: false });
    state.setupReady = true;
    state.setupReason = '';
    ensureSetupGate();
    return;
  }

  state.setupReady = false;
  state.setupReason = `Preparing offline pack for ${active.name || state.activeRegion}`;
  ensureSetupGate();

  try {
    const patch = await regionProvisioner.provisionRegion(
      state.activeRegion,
      async (progress, label) => {
        state.setupReason = `${label || 'Preparing offline pack'} (${Math.round(progress || 0)}%)`;
        ensureSetupGate();
        state.offlineRegions = await offlineStore.updateProgress(
          state.activeRegion,
          Math.max(0, Math.min(100, Number(progress) || 0)),
        );
      },
      {
        skipGraphhopper: true,
        tolerateGraphhopperFailure: true,
      },
    );

    state.offlineRegions = await offlineStore.markDownloaded(state.activeRegion, patch);
    await syncRegionAssets(state.activeRegion, { recenter: false });
    state.setupReady = true;
    state.setupReason = '';
    ensureSetupGate();
  } catch (error) {
    await syncRegionAssets(state.activeRegion, { recenter: false });
    state.setupReady = true;
    state.setupReason = '';
    ensureSetupGate();
    addAIMessage('assistant', `Offline provisioning warning: ${error?.message || 'unknown error'}. Running bundled offline mode.`);
  }
}
async function bootstrapLocation() {
  try {
    await gps.requestPermission();
    const position = await gps.getCurrentPosition();
    if (!position) return;

    handlePositionUpdate(position);

    const inferredRegion = offlineStore.inferRegionForPosition(position.lng, position.lat);
    if (inferredRegion && inferredRegion.id !== state.activeRegion) {
      await syncRegionAssets(inferredRegion.id, { recenter: true });
    }
  } catch {
    return;
  }
}

async function syncRegionAssets(regionId, { recenter = false } = {}) {
  state.activeRegion = regionId;
  geocoder.setRegion(regionId);
  mapView.updateSourceConfig(offlineStore.getSourceConfig(regionId));
  const regionMeta = state.offlineRegions.find((region) => region.id === regionId) || null;
  const isDownloaded = Boolean(regionMeta?.downloaded);

  // Always prefer the bundled regional assets as a baseline for routing/search.
  // Downloaded packs can later override these paths, but we never want to force a
  // tiny demo graph just because a region isn't downloaded yet.
  const { graph, pois } = await offlineDataLoader.loadRegionAssets(
    regionId,
    {
      graphFallback: DEMO_GRAPH,
      poiFallback: geocoder.points,
    },
    false,
  );

  geocoder.setDataset(pois);
  await geocoder.prepareRegionIndex({
    regionId,
    graphPath: isDownloaded ? (regionMeta?.graphPath || null) : null,
    poiPath: isDownloaded ? (regionMeta?.poiPath || null) : null,
    dataVersion: isDownloaded ? (regionMeta?.dataVersion || null) : null,
  });
  state.searchBackend = geocoder.getBackendStatus().backend;
  await routing.loadGraph(graph);
  const routingStatus = await routing.prepareRegion({
    regionId,
    // GraphHopper graphs are activated only when shipped in packs.
    // Until then, JS A* remains the fallback.
    graphhopperDir: isDownloaded ? (regionMeta?.graphhopperDir || null) : null,
  });
  state.routingBackend = routingStatus?.backend || 'js-astar';
  state.setupReady = Boolean(isDownloaded || routingStatus?.graphPackLoaded);
  state.setupReason = state.setupReady ? '' : 'Routing pack is not loaded yet';
  state.offlineRegions = await offlineStore.hydrateRegions();
  updateOfflineReadyBadge();
  updateRuntimeBadge();
  ensureSetupGate();

  if (recenter) {
    mapView.setRegion(regionId);
  }
}

function handlePositionUpdate(position) {
  mapView.setUserLocation(position.lng, position.lat, position.heading);

  if (!state.origin) {
    state.origin = { name: 'Current Location', lng: position.lng, lat: position.lat };
    mapView.flyTo(position.lng, position.lat, 12);
  }

  if (state.isNavigating) {
    mapView.flyTo(position.lng, position.lat, 15);
    updateNavHUD(position);
  }
}

function setupSearchUI() {
  let searchTimeout;

  const onFocus = (input) => {
    activeInput = input;
    suggestionsPanel.classList.remove('hidden');
    if (input.value.trim().length >= 2) {
      triggerSearch(input.value);
    }
  };

  const onInput = (event) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => triggerSearch(event.target.value), 250);
  };

  searchInput.addEventListener('input', (event) => {
    clearSearchBtn.classList.toggle('hidden', !event.target.value);
    onInput(event);
  });

  originInput.addEventListener('input', onInput);
  destInput.addEventListener('input', onInput);

  searchInput.addEventListener('focus', () => onFocus(searchInput));
  originInput.addEventListener('focus', () => onFocus(originInput));
  destInput.addEventListener('focus', () => onFocus(destInput));

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    suggestionsPanel.classList.add('hidden');
    placePanel.classList.remove('visible');
    mapView.clearMarkers();
  });

  const blurHandler = () => {
    setTimeout(() => suggestionsPanel.classList.add('hidden'), 160);
  };

  searchInput.addEventListener('blur', blurHandler);
  originInput.addEventListener('blur', blurHandler);
  destInput.addEventListener('blur', blurHandler);

  document.getElementById('directions-btn').addEventListener('click', () => {
    placePanel.classList.remove('visible');
    routePanelBox.classList.remove('hidden');
    routePanelBox.style.display = 'block';
    if (state.destination) {
      destInput.value = state.destination.name;
    }
    calculateRoute();
  });

  document.getElementById('locate-btn').addEventListener('click', async () => {
    try {
      const position = await gps.getCurrentPosition();
      if (!position) return;
      state.origin = { name: 'Current Location', lng: position.lng, lat: position.lat };
      mapView.setUserLocation(position.lng, position.lat, position.heading);
      mapView.flyTo(position.lng, position.lat, 14);
    } catch {
      alert('Location not available.');
    }
  });

  document.getElementById('gps-btn').addEventListener('click', async () => {
    try {
      const position = await gps.getCurrentPosition();
      if (!position) return;
      state.origin = { name: 'Current Location', lng: position.lng, lat: position.lat };
      originInput.value = 'Current Location';
    } catch {
      return;
    }
  });
}

function setupQuickSearch() {
  document.querySelectorAll('.q-chip').forEach((chip) => {
    chip.addEventListener('mousedown', async (event) => {
      event.preventDefault(); // Prevent input focus loss
      const query = chip.dataset.query;
      searchInput.value = chip.textContent.trim();
      const bias = state.origin ? { biasLng: state.origin.lng, biasLat: state.origin.lat } : {};
      const results = await geocoder.search(query, 6, bias);
      renderSuggestions(results);
      suggestionsPanel.classList.remove('hidden');
    });
  });
}

async function triggerSearch(query) {
  if (!query || query.trim().length < 2) {
    suggestionsList.innerHTML = '';
    return;
  }

  const searchSequence = ++activeSearchSequence;
  const bias = state.origin ? { biasLng: state.origin.lng, biasLat: state.origin.lat } : {};
  const results = await geocoder.search(query, 6, bias);
  if (searchSequence !== activeSearchSequence) {
    return;
  }
  renderSuggestions(results);
}

function renderSuggestions(results) {
  suggestionsList.innerHTML = results
    .map(
      (result, index) => `
        <div class="suggestion-item" data-index="${index}">
          <div class="suggestion-icon">${getSuggestionIcon(result.type)}</div>
          <div>
            <div class="suggestion-name">${result.name}</div>
            <div class="suggestion-addr">${result.type}</div>
          </div>
        </div>
      `,
    )
    .join('');

  suggestionsList.querySelectorAll('.suggestion-item').forEach((element, index) => {
    element.addEventListener('mousedown', async (event) => {
      event.preventDefault(); // Keep focus to prevent blur race conditions
      const result = results[index];
      if (activeInput === originInput) {
        state.origin = { name: result.name, lng: result.lng, lat: result.lat };
        originInput.value = result.name;
      } else if (activeInput === destInput) {
        state.destination = { name: result.name, lng: result.lng, lat: result.lat };
        destInput.value = result.name;
        await calculateRoute();
      } else {
        showPlaceInfo(result);
      }
      suggestionsPanel.classList.add('hidden');
    });
  });
}

function getSuggestionIcon(type) {
  const iconByType = {
    fuel: 'F',
    charging: 'E',
    hospital: 'H',
    pharmacy: 'P',
    hotel: 'L',
    restaurant: 'R',
    rest_area: 'S',
    station: 'T',
    city: 'C',
    landmark: 'M',
  };
  return iconByType[type] || 'N';
}

function showPlaceInfo(place) {
  state.destination = { name: place.name, lng: place.lng, lat: place.lat };
  searchInput.value = place.name;
  clearSearchBtn.classList.remove('hidden');
  placeName.textContent = place.name;
  placeSubtitle.textContent = place.type;

  mapView.clearMarkers();
  mapView.addPinMarker(place.lng, place.lat, place.name);
  mapView.flyTo(place.lng, place.lat, 15);
  placePanel.classList.add('visible');
}

async function selectDestination(place) {
  state.destination = { name: place.name, lng: place.lng, lat: place.lat };
  searchInput.value = place.name;
  mapView.clearMarkers();
  mapView.addPinMarker(place.lng, place.lat, place.name);
  suggestionsPanel.classList.add('hidden');
  await calculateRoute();
}

async function calculateRoute() {
  if (!state.setupReady) {
    alert('Offline setup is not ready yet. Complete region activation first.');
    window.openOfflineManager?.();
    return;
  }
  if (!state.destination && destInput.value.trim().length >= 2) {
    const bias = state.origin
      ? { biasLng: state.origin.lng, biasLat: state.origin.lat }
      : {};
    const results = await geocoder.search(destInput.value, 5, bias);
    if (results.length > 0) {
      const chosen = state.origin
        ? results
            .map((item) => ({
              item,
              distance: haversineDistance(state.origin, { lng: item.lng, lat: item.lat }),
            }))
            .sort((a, b) => a.distance - b.distance)[0].item
        : results[0];
      state.destination = {
        name: chosen.name,
        lng: chosen.lng,
        lat: chosen.lat,
      };
    }
  }

  if (!state.destination) return;

  if (!state.origin) {
    const center = mapView.getMap()?.getCenter();
    if (center) {
      state.origin = { name: 'Current Location', lng: center.lng, lat: center.lat };
    }
  }

  if (!state.origin) {
    alert('Set your start location first (GPS or From field).');
    return;
  }

  let route = null;
  if (jsRouter.loaded) {
    route = await routing.routeLatLng(
      state.origin.lng,
      state.origin.lat,
      state.destination.lng,
      state.destination.lat,
      state.routeMode,
    );
  }

  if (!route) {
    route = buildRegionalGuidanceRoute(state.origin, state.destination, state.activeRegion);
  }

  state.currentRoute = route;
  mapView.drawRoute(route.geojson);
  showRoutePanel(route);
}

function buildRegionalGuidanceRoute(origin, destination, regionId = state.activeRegion) {
  const routeTemplates = {
    india_goa: {
      waypoints: [
        { name: 'Panaji city roads', lng: 73.8278, lat: 15.4909, note: 'expect city traffic and bus stand movement near Panaji' },
        { name: 'Ponda junction', lng: 74.0128, lat: 15.402, note: 'major junction ahead; keep lane discipline' },
        { name: 'Margao approach', lng: 73.958, lat: 15.273, note: 'railway and market traffic near Margao' },
        { name: 'South Goa corridor', lng: 74.0, lat: 15.1, note: 'watch for school zones and local crossings in South Goa' },
      ],
      encounters: [
        'Panaji Bus Stand on the route corridor',
        'Ponda junction and fuel/service access on the way',
        'Margao railway/market area before South Goa',
        'Hospitals and pharmacies are available around Panaji and Margao',
      ],
    },
    usa_hawaii: {
      waypoints: [
        { name: 'Honolulu downtown', lng: -157.8583, lat: 21.3069, note: 'urban traffic and pedestrian crossings near downtown Honolulu' },
        { name: 'H1 corridor', lng: -157.9, lat: 21.35, note: 'freeway merge area; follow lane guidance carefully' },
        { name: 'Airport corridor', lng: -157.9224, lat: 21.3245, note: 'airport traffic and parking exits nearby' },
      ],
      encounters: ['Honolulu city traffic', 'H1 freeway corridor', 'Airport services and fuel access'],
    },
    kr_seoul_core: {
      waypoints: [
        { name: 'Seoul Station', lng: 126.9707, lat: 37.5551, note: 'dense station traffic and bus lanes nearby' },
        { name: 'Han River crossing', lng: 126.994, lat: 37.528, note: 'bridge crossing ahead; keep steady speed' },
        { name: 'Gangnam Station', lng: 127.0276, lat: 37.4979, note: 'dense urban traffic and pedestrian crossings near Gangnam' },
      ],
      encounters: ['Seoul Station transit area', 'Han River bridge crossing', 'Gangnam dense urban corridor'],
    },
  };

  const template = routeTemplates[regionId] || routeTemplates.india_goa;
  const directDistance = haversineDistance(origin, destination);
  const shouldUseTemplate = directDistance > 1800;
  const coords = [[origin.lng, origin.lat]];

  if (shouldUseTemplate) {
    for (const waypoint of template.waypoints) {
      const originDistance = haversineDistance(origin, waypoint);
      const destinationDistance = haversineDistance(destination, waypoint);
      if (originDistance > 350 && destinationDistance > 350) {
        coords.push([waypoint.lng, waypoint.lat]);
      }
    }
  }

  coords.push([destination.lng, destination.lat]);

  const distance = coords.slice(1).reduce((total, coord, index) => {
    const previous = coords[index];
    return total + haversine(previous, coord);
  }, 0);
  const speedKph = state.routeMode === 'eco' ? 45 : state.routeMode === 'safest' ? 38 : 52;
  const duration = distance / (speedKph * 1000 / 3600);

  const instructions = buildGuidanceInstructions(coords, destination, template);

  return {
    source: 'offline-guidance',
    path: coords.map((coord, index) => `guidance_${index}`),
    coords,
    distance: Math.round(distance),
    duration: Math.round(duration),
    encounters: template.encounters,
    instructions,
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { distance, duration, source: 'offline-guidance' },
        },
      ],
    },
  };
}

function buildGuidanceInstructions(coords, destination, template) {
  const instructions = [];
  for (let index = 1; index < coords.length; index += 1) {
    const previous = coords[index - 1];
    const current = coords[index];
    const segmentDistance = haversine(previous, current);
    const waypoint = template.waypoints[index - 1];
    const isLast = index === coords.length - 1;
    if (isLast) {
      instructions.push({
        text: `Continue towards ${destination.name}`,
        dist: Math.round(segmentDistance),
        icon: 'straight',
      });
      instructions.push({ text: `Arrive at ${destination.name}`, dist: 0, icon: 'arrive' });
    } else {
      instructions.push({
        text: `Continue via ${waypoint?.name || 'main road'}; ${waypoint?.note || 'stay on the main route'}`,
        dist: Math.round(segmentDistance),
        icon: index % 2 === 0 ? 'right' : 'straight',
      });
    }
  }
  return instructions;
}

function buildFallbackRoute(origin, destination) {
  return buildRegionalGuidanceRoute(origin, destination, state.activeRegion);
}

function setupRouteUI() {
  document.querySelectorAll('.option-chip').forEach((button) => {
    button.addEventListener('click', async () => {
      document.querySelectorAll('.option-chip').forEach((chip) => chip.classList.remove('active'));
      button.classList.add('active');
      state.routeMode = button.dataset.mode;
      if (state.destination) {
        await calculateRoute();
      }
    });
  });

  document.getElementById('start-navigate-btn').addEventListener('click', startNavigation);
}

function showRoutePanel(route) {
  routeTime.textContent = formatDuration(route.duration);
  routeDistance.textContent = `${(route.distance / 1000).toFixed(1)} km`;

  const badgeByMode = {
    fastest: { text: 'FASTEST', background: 'rgba(59,130,246,0.18)', color: '#60a5fa' },
    safest: { text: 'SAFEST', background: 'rgba(16,185,129,0.18)', color: '#34d399' },
    eco: { text: 'ECO', background: 'rgba(245,158,11,0.18)', color: '#fbbf24' },
    'no-toll': { text: 'NO TOLL', background: 'rgba(148,163,184,0.18)', color: '#cbd5e1' },
  };

  const badge = badgeByMode[state.routeMode] || badgeByMode.fastest;
  safetyBadge.textContent = badge.text;
  safetyBadge.style.background = badge.background;
  safetyBadge.style.color = badge.color;

  const instructions = Array.isArray(route.instructions) && route.instructions.length > 0
    ? route.instructions
    : jsRouter.generateInstructions(route.path || [], route.coords || []);
  state.currentInstructions = instructions.length > 0
    ? instructions
    : [
        { text: `Head towards ${state.destination.name}`, dist: route.distance, icon: 'straight' },
        { text: `Arrive at ${state.destination.name}`, dist: 0, icon: 'arrive' },
      ];
  renderTurnByTurn(state.currentInstructions);  navSession.setRoute(route.coords || [], state.currentInstructions);  routePanel.classList.remove('hidden');
  setTimeout(() => routePanel.classList.add('visible'), 30);

  if (state.isNavigating) {
    updateHUD(route);
  }
}

function renderTurnByTurn(instructions) {
  const icons = {
    start: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>`,
    straight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
    left: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M11 6L5 12l6 6"/></svg>`,
    right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
    arrive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  };

  turnList.innerHTML = instructions
    .map(
      (instruction) => `
        <div class="turn-item">
          <div class="turn-icon">${icons[instruction.icon] || icons.straight}</div>
          <div class="turn-text">${instruction.text}</div>
          ${instruction.dist > 0 ? `<div class="turn-dist">${formatDistance(instruction.dist)}</div>` : ''}
        </div>
      `,
    )
    .join('');
}

function setupNavUI() {
  document.getElementById('hud-exit-btn').addEventListener('click', stopNavigation);

  arModeButton?.addEventListener('click', async () => {
    const arView = document.getElementById('ar-view');
    const arVideo = document.getElementById('ar-video');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      arVideo.srcObject = stream;
      arView.classList.remove('hidden');
      arView.classList.add('active');
    } catch {
      alert('Camera access is unavailable on this device.');
    }
  });

  document.getElementById('exit-ar-btn').addEventListener('click', () => {
    const arView = document.getElementById('ar-view');
    const arVideo = document.getElementById('ar-video');
    const stream = arVideo.srcObject;
    stream?.getTracks().forEach((track) => track.stop());
    arVideo.srcObject = null;
    arView.classList.add('hidden');
    arView.classList.remove('active');
  });
}

function startNavigation() {
  if (!state.setupReady) {
    alert('Offline routing is not ready. Complete setup first.');
    window.openOfflineManager?.();
    return;
  }
  if (!state.currentRoute) return;

  state.isNavigating = true;
  navSession.reset();
  navSession.setRoute(state.currentRoute.coords || [], state.currentInstructions || []);
  state.activeInstructionIndex = 0;

  document.body.classList.add('navigating');
  routePanel.classList.remove('visible');
  routePanel.classList.add('hidden');
  navHud.classList.remove('hidden');
  updateHUD(state.currentRoute);

  if (meshAlert) {
    setTimeout(() => {
      meshAlert.style.display = 'flex';
      document.getElementById('mesh-reroute-btn').onclick = async () => {
        meshAlert.style.display = 'none';
        await calculateRoute();
      };
    }, 10000);
  }
}

function stopNavigation() {
  state.isNavigating = false;
  navSession.reset();

  document.body.classList.remove('navigating');
  navHud.classList.add('hidden');
  routePanel.classList.remove('visible');
  routePanel.classList.add('hidden');
  meshAlert.style.display = 'none';

  mapView.clearRoute();
  mapView.clearMarkers();
  state.currentRoute = null;
  state.destination = null;
  searchInput.value = '';
}
function updateHUD(route, navSnapshot = null) {
  const remainingMeters = navSnapshot?.distanceRemainingMeters ?? route.distance;
  hudDistance.textContent = remainingMeters != null
    ? `${(remainingMeters / 1000).toFixed(1)} km`
    : `${(route.distance / 1000).toFixed(1)} km`;

  const currentStep = navSession.active
    ? (navSession.currentInstruction() || { text: `Head toward ${state.destination?.name || 'destination'}`, icon: 'straight' })
    : ((state.currentInstructions || [])[state.activeInstructionIndex || 0] || { text: `Head toward ${state.destination?.name || 'destination'}`, icon: 'straight' });

  hudInstruction.textContent = currentStep.text;

  const remainingTimeSeconds = (route.distance && remainingMeters != null)
    ? Math.max(0, Math.round(route.duration * (remainingMeters / route.distance)))
    : route.duration;
  hudTime.textContent = formatDuration(remainingTimeSeconds);

  const eta = new Date();
  eta.setSeconds(eta.getSeconds() + remainingTimeSeconds);
  hudArrival.textContent = `ETA ${eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const arText = document.getElementById('ar-text');
  if (arText) arText.textContent = currentStep.text;
  const arArrowSvg = document.getElementById('ar-arrow-svg');
  if (arArrowSvg) {
    let rotation = '0deg';
    if (currentStep.icon === 'left') rotation = '-90deg';
    else if (currentStep.icon === 'right') rotation = '90deg';
    else if (currentStep.icon === 'arrive') rotation = '180deg';
    arArrowSvg.style.transform = `rotate(${rotation})`;
  }
}

function updateNavHUD(position) {
  if (!position) return;

  let navSnapshot = null;
  if (state.isNavigating && state.currentRoute && navSession.active) {
    navSnapshot = navSession.updateFromGps({
      lng: position.lng,
      lat: position.lat,
      speedMps: position.speed || 0,
      headingDeg: position.heading,
      accuracyM: position.accuracy,
      timestampMs: position.timestampMs || Date.now(),
    });

    if (navSnapshot?.matched) {
      mapView.setUserLocation(navSnapshot.matched.lng, navSnapshot.matched.lat);
    } else {
      mapView.setUserLocation(position.lng, position.lat, position.heading);
    }

    if (navSnapshot?.shouldReroute && !state.rerouteInProgress) {
      state.rerouteInProgress = true;
      const originLng = navSnapshot?.matched?.lng ?? position.lng;
      const originLat = navSnapshot?.matched?.lat ?? position.lat;
      state.origin = { name: 'Current Location', lng: originLng, lat: originLat };
      calculateRoute().finally(() => { state.rerouteInProgress = false; });
    }

    updateHUD(state.currentRoute, navSnapshot);
    return;
  }

  mapView.setUserLocation(position.lng, position.lat, position.heading);
  if (state.currentRoute) {
    updateHUD(state.currentRoute, navSnapshot);
  }
}
function setupAIPanel() {
  document.getElementById('ai-fab-btn').addEventListener('click', async () => {
    aiPanel.classList.remove('hidden');
    if (!aiBootstrapped) {
      await loadAIProvider();
      aiBootstrapped = true;
    }
  });

  document.getElementById('ai-close-btn').addEventListener('click', () => {
    aiPanel.classList.add('hidden');
  });

  document.getElementById('ai-send-btn').addEventListener('click', sendAIMessage);
  aiInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      sendAIMessage();
    }
  });

  document.getElementById('voice-btn').addEventListener('click', startVoiceInput);
}

async function loadAIProvider() {
  aiLoadingOverlay.classList.remove('hidden');
  ai.onProgress((percent, message) => {
    aiProgressFill.style.width = `${percent}%`;
    aiLoadingText.textContent = message;
  });

  try {
    await ai.load();
    const providerStatus = ai.getProviderStatus();
    const providerLabel = ai.getProviderLabel();
    aiStatusDot.style.background = providerStatus?.supportsNativeMelange ? '#10b981' : '#f59e0b';
    aiProviderNote.textContent = providerStatus?.supportsNativeMelange
      ? (providerLabel + ' active')
      : (providerLabel + ' active');
    const modelNameElem = document.getElementById('ai-model-name');
    const accelElem = document.getElementById('ai-acceleration');
    if (modelNameElem) {
      modelNameElem.textContent = providerStatus?.semanticModelName || providerStatus?.models?.semantic || providerStatus?.models?.llm || providerStatus?.llmModelName || 'unknown';
    }
    if (accelElem) {
      ai.getTelemetry().then(telemetry => {
        accelElem.textContent = telemetry.npuAccelerated ? 'NPU Accelerated' : 'CPU Inference';
      }).catch(() => {
        accelElem.textContent = 'Hardware Status Unknown';
      });
    }

    addAIMessage(
      'assistant',
      providerStatus?.supportsNativeMelange
        ? 'Melange is active for local navigation intelligence.'
        : 'Local navigation assistant is active. Native Melange semantic runtime will switch on automatically when the device runtime prepares successfully.',
    );
  } catch {
    aiStatusDot.style.background = '#ef4444';
    aiProviderNote.textContent = 'Assistant unavailable';
    addAIMessage('assistant', 'The AI layer could not be initialized.');
  } finally {
    aiLoadingOverlay.classList.add('hidden');
    updateRuntimeBadge();
  }
}

async function sendAIMessage() {
  const text = aiInput.value.trim();
  if (!text) return;

  addAIMessage('user', text);
  state.aiHistory.push({ role: 'user', content: text });
  aiInput.value = '';

  const thinkingBubble = addAIMessage('thinking', '');
  const parsed = await ai.parseRoutingQuery(text);

  let response = '';
  if (parsed.destination || parsed.poi) {
    response = await handleAIRouteQuery(parsed);
  } else {
    response = await ai.chat(text, state.aiHistory);
  }

  thinkingBubble.remove();
  addAIMessage('assistant', response);
  state.aiHistory.push({ role: 'assistant', content: response });
}

async function handleAIRouteQuery(parsed) {
  if (parsed.destination) {
    const results = await geocoder.search(parsed.destination, 1);
    if (!results[0]) {
      return `I could not find ${parsed.destination} in the local place index.`;
    }

    state.routeMode = parsed.mode;
    syncRouteModeChip(parsed.mode);
    await selectDestination(results[0]);
    return buildRouteBriefingResponse(results[0].name, parsed.mode);
  }

  if (parsed.poi) {
    const origin = state.origin || gps.getPosition();
    const nearby = geocoder.findNearby(parsed.poi, origin, 1);
    if (!nearby[0]) {
      return `I do not have a nearby ${parsed.poi} in the current offline region yet.`;
    }

    state.destination = {
      name: nearby[0].name,
      lng: nearby[0].lng,
      lat: nearby[0].lat,
    };
    destInput.value = nearby[0].name;
    await calculateRoute();
    return buildRouteBriefingResponse(nearby[0].name, parsed.mode || state.routeMode, parsed.poi);
  }

  return 'Tell me where you want to go or what kind of stop you need.';
}

function buildRouteBriefingResponse(destinationName, mode = 'fastest', requestedPoi = null) {
  const aiHealth = window.getAIHealth?.() || {};
  const navHealth = window.getNavigationHealth?.() || {};
  const runtimeNotice = aiHealth.supportsNativeMelange
    ? 'Melange semantic assistant is active.'
    : 'Local navigation assistant is active while native Melange prepares.';

  if (!state.currentRoute) {
    return `${runtimeNotice} I found ${destinationName}, but route is not ready yet. Please open Offline Manager, download the active region pack, and activate it.`;
  }

  const eta = formatDuration(state.currentRoute.duration || 0);
  const distance = formatDistance(state.currentRoute.distance || 0);
  const turnPreview = summarizeUpcomingTurns(state.currentInstructions || []);
  const encounters = summarizeRouteEncounters(state.currentRoute);
  const routingNote = navHealth.routingBackend === 'graphhopper-native'
    ? 'Using GraphHopper native routing.'
    : 'Using offline route guidance for this demo region.';
  const poiNote = requestedPoi ? `Requested stop type: ${requestedPoi.replace('_', ' ')}.` : '';

  return `${runtimeNotice} ${routingNote} Best ${mode} route to ${destinationName} is ready: ${distance}, ETA ${eta}. ${turnPreview} ${encounters} ${poiNote}`.trim();
}

function summarizeUpcomingTurns(instructions) {
  const actionable = (instructions || []).filter((step) => step && step.text && step.icon !== 'arrive').slice(0, 2);
  if (!actionable.length) {
    return 'Turn preview is not available yet.';
  }
  return `Upcoming: ${actionable.map((step) => step.text).join(' Then ')}.`;
}

function summarizeRouteEncounters(route) {
  const coords = route?.coords || [];
  if (!Array.isArray(coords) || coords.length === 0 || !Array.isArray(geocoder?.points)) {
    return 'Encounter summary is unavailable.';
  }

  const targetTypes = ['fuel', 'charging', 'hospital', 'restaurant', 'rest_area'];
  const labels = {
    fuel: 'fuel',
    charging: 'EV charging',
    hospital: 'hospital',
    restaurant: 'food stop',
    rest_area: 'rest area',
  };
  const nearestByType = new Map();

  for (const poi of geocoder.points) {
    if (!poi || poi.region !== state.activeRegion || !targetTypes.includes(poi.type)) {
      continue;
    }

    let minDistance = Number.POSITIVE_INFINITY;
    for (const [lng, lat] of coords) {
      const d = haversine([lng, lat], [poi.lng, poi.lat]);
      if (d < minDistance) minDistance = d;
      if (minDistance < 500) break;
    }

    if (minDistance > 4000) continue;

    const existing = nearestByType.get(poi.type);
    if (!existing || minDistance < existing.distance) {
      nearestByType.set(poi.type, { name: poi.name, distance: minDistance });
    }
  }

  if (!nearestByType.size) {
    if (Array.isArray(route?.encounters) && route.encounters.length > 0) {
      return `On the way: ${route.encounters.slice(0, 4).join(', ')}.`;
    }
    return 'No major fuel, charging, hospital, or rest stops detected close to this route.';
  }

  const ordered = ['fuel', 'charging', 'hospital', 'restaurant', 'rest_area']
    .map((type) => ({ type, hit: nearestByType.get(type) }))
    .filter((item) => item.hit)
    .map((item) => `${labels[item.type]} near ${item.hit.name} (~${formatDistance(Math.round(item.hit.distance))})`);

  return `On the way: ${ordered.join(', ')}.`;
}
function addAIMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `ai-msg ${role}`;

  if (role === 'thinking') {
    bubble.innerHTML = '<div class="dot-anim"></div><div class="dot-anim"></div><div class="dot-anim"></div>';
  } else {
    bubble.textContent = text;
  }

  aiMessages.appendChild(bubble);
  aiMessages.scrollTop = aiMessages.scrollHeight;
  return bubble;
}

async function startVoiceInput() {
  if (!aiBootstrapped) {
    try {
      await loadAIProvider();
      aiBootstrapped = true;
    } catch {
      return fallbackVoiceInput();
    }
  }

  if (ai.supportsVoiceCommands()) {
    try {
      const audioBase64 = await captureNavigationAudio();
      const transcript = await ai.transcribeNavigationCommand(audioBase64);
      if (transcript) {
        searchInput.value = transcript;
        await triggerSearch(transcript);
        suggestionsPanel.classList.remove('hidden');
        return;
      }
    } catch {
      return fallbackVoiceInput();
    }
  }

  fallbackVoiceInput();
}

function fallbackVoiceInput() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Voice input is unavailable in this environment.');
    return;
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    searchInput.value = transcript;
    await triggerSearch(transcript);
    suggestionsPanel.classList.remove('hidden');
  };
  recognition.start();
}

function setupOfflineManager() {
  const offlineManager = document.getElementById('offline-manager');
  const regionList = document.getElementById('offline-region-list');
  const mainMenuButton = document.getElementById('main-menu-btn');
  const closeButton = document.getElementById('offline-close-btn');

  const renderRegions = () => {
  updateOfflineReadyBadge();
  updateRuntimeBadge();
    regionList.innerHTML = state.offlineRegions
      .map(
        (region) => `
          <div class="region-item" id="region-${region.id}">
            <div class="region-info">
              <h3>${region.name}</h3>
              <p>${region.sizeLabel}</p>
              <p class="region-meta">${region.automotiveFocus}</p>
              <p class="region-meta">Data ${region.dataVersion}</p>
              ${region.transactionStatus ? `<p class="region-meta">Update ${region.transactionStatus}</p>` : ''}
              ${
                region.transactionAssetPath
                  ? `<p class="region-meta">Asset ${region.transactionAssetPath.split('/').pop()}</p>`
                  : ''
              }
              ${
                Number.isFinite(region.transactionDownloadedBytes) && Number.isFinite(region.transactionTotalBytes)
                  ? `<p class="region-meta">Bytes ${Math.round(region.transactionDownloadedBytes / 1024)} KB / ${Math.round(region.transactionTotalBytes / 1024)} KB</p>`
                  : ''
              }
              ${
                Number.isFinite(region.transactionRetryCount)
                  ? `<p class="region-meta">Retries ${region.transactionRetryCount}</p>`
                  : ''
              }
              ${
                Number.isFinite(region.transactionEtaSeconds)
                  ? `<p class="region-meta">ETA ${Math.round(region.transactionEtaSeconds)}s</p>`
                  : ''
              }
              ${
                Number.isFinite(region.transactionBytesPerSecond)
                  ? `<p class="region-meta">Speed ${Math.round(region.transactionBytesPerSecond / 1024)} KB/s</p>`
                  : ''
              }
              ${region.transactionChunkStatus ? `<p class="region-meta">Chunk ${region.transactionChunkStatus}</p>` : ''}
              ${region.transactionChunkError ? `<p class="region-meta" style="color:#b91c1c;">${region.transactionChunkError}</p>` : ''}
              ${region.lastError ? `<p class="region-meta" style="color:#b91c1c;">${region.lastError}</p>` : ''}
            </div>
            <div style="text-align: right; min-width: 120px;">
              ${
                region.downloaded
                  ? `<button class="download-btn downloaded">Ready</button>
                     <div class="region-meta">${region.verifiedAt ? `Verified ${new Date(region.verifiedAt).toLocaleDateString()}` : ''}</div>
                     <div class="region-actions">
                       <button class="region-action-btn" onclick="activateRegion('${region.id}')" ${region.id === state.activeRegion ? 'disabled' : ''}>${region.id === state.activeRegion ? 'Active' : 'Use this region'}</button>
                       <button class="region-action-btn" onclick="deleteRegionPack('${region.id}')">Delete</button>
                     </div>`
                  : region.releaseStatus === 'released'
                    ? `<button class="download-btn" onclick="startDownload('${region.id}')">Download</button>
                     <div class="progress-bar-container" id="progress-${region.id}">
                       <div class="progress-bar" id="bar-${region.id}"></div>
                     </div>`
                    : `<button class="download-btn" disabled style="opacity:0.55; cursor:not-allowed;">Planned</button>
                       <div class="region-meta">Pack generation pending</div>`
              }
              ${
                !region.downloaded &&
                region.transactionStatus &&
                ['download', 'verify', 'activate'].includes(region.transactionStatus)
                  ? `<div style="margin-top: 8px; display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
                       ${
                         region.transactionPaused
                           ? `<button class="download-btn" onclick="resumeDownload('${region.id}')">Resume</button>`
                           : `<button class="download-btn" onclick="pauseDownload('${region.id}')">Pause</button>`
                       }
                       <button class="download-btn" onclick="cancelDownload('${region.id}')">Cancel</button>
                     </div>`
                  : ''
              }
              ${
                !region.downloaded && region.transactionStatus === 'interrupted'
                  ? `<div style="margin-top: 8px; display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
                       <button class="download-btn" onclick="retryDownload('${region.id}')">Retry</button>
                       <button class="download-btn" onclick="clearDownloadState('${region.id}')">Clean up</button>
                     </div>`
                  : ''
              }
            </div>
          </div>
        `,
      )
      .join('');
  };

  window.openOfflineManager = () => {
    renderRegions();
    offlineManager.classList.remove('hidden');
    setTimeout(() => offlineManager.classList.add('visible'), 10);
  };

  mainMenuButton.addEventListener('click', () => {
    window.openOfflineManager();
  });

  closeButton.addEventListener('click', () => {
    offlineManager.classList.remove('visible');
    setTimeout(() => offlineManager.classList.add('hidden'), 280);
  });

  window.startDownload = async (regionId) => {
    const button = document.querySelector(`#region-${regionId} .download-btn`);
    const progressContainer = document.getElementById(`progress-${regionId}`);
    const progressBar = document.getElementById(`bar-${regionId}`);
    if (!button || !progressContainer || !progressBar) return;

    button.style.display = 'none';
    progressContainer.style.display = 'block';

    try {
      const patch = await regionProvisioner.provisionRegion(
        regionId,
        async (progress) => {
          progressBar.style.width = `${progress}%`;
          state.offlineRegions = await offlineStore.updateProgress(regionId, progress);
        },
        { skipGraphhopper: true, tolerateGraphhopperFailure: true },
      );

      state.offlineRegions = await offlineStore.markDownloaded(regionId, patch);
      if (regionId === state.activeRegion) {
        await syncRegionAssets(regionId, { recenter: false });
      }
      renderRegions();
    } catch (error) {
      button.style.display = 'inline-flex';
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
      state.offlineRegions = await offlineStore.markFailed(
        regionId,
        error?.message || 'Download failed',
      );
      renderRegions();
    }
  };

  window.pauseDownload = async (regionId) => {
    regionProvisioner.pauseRegion(regionId);
    state.offlineRegions = await offlineStore.hydrateRegions();
    renderRegions();
  };

  window.resumeDownload = async (regionId) => {
    regionProvisioner.resumeRegion(regionId);
    state.offlineRegions = await offlineStore.hydrateRegions();
    renderRegions();
  };

  window.cancelDownload = async (regionId) => {
    regionProvisioner.cancelRegion(regionId);
    state.offlineRegions = await offlineStore.hydrateRegions();
    renderRegions();
  };

  window.retryDownload = async (regionId) => {
    state.offlineRegions = await offlineStore.clearTransaction(regionId);
    renderRegions();
    await window.startDownload(regionId);
  };

  window.clearDownloadState = async (regionId) => {
    state.offlineRegions = await offlineStore.clearTransaction(regionId);
    renderRegions();
  };


  window.activateRegion = async (regionId) => {
    const target = state.offlineRegions.find((region) => region.id === regionId);
    if (!target?.downloaded) {
      alert('Download this region first.');
      return;
    }
    await syncRegionAssets(regionId, { recenter: true });
    renderRegions();
  };

  window.deleteRegionPack = async (regionId) => {
    const target = state.offlineRegions.find((region) => region.id === regionId);
    if (!target?.downloaded) {
      return;
    }
    const ok = window.confirm(`Delete offline pack for ${target.name}?`);
    if (!ok) return;

    await regionProvisioner.deleteRegion(regionId);
    state.offlineRegions = await offlineStore.hydrateRegions();

    if (regionId === state.activeRegion) {
      const fallback = state.offlineRegions.find((region) => region.downloaded) || state.offlineRegions[0];
      if (fallback) {
        await syncRegionAssets(fallback.id, { recenter: true });
      }
    }
    renderRegions();
  };
}

function setupFABs() {
  document.getElementById('zoom-in-btn').addEventListener('click', () => {
    mapView.getMap()?.zoomIn({ duration: 240 });
  });

  document.getElementById('zoom-out-btn').addEventListener('click', () => {
    mapView.getMap()?.zoomOut({ duration: 240 });
  });

  document.getElementById('compass-btn').addEventListener('click', () => {
    mapView.getMap()?.resetNorthPitch({ duration: 400 });
  });
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  return `${minutes} min`;
}

function formatDistance(distanceMeters) {
  return distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(1)} km`
    : `${distanceMeters} m`;
}

function syncRouteModeChip(mode) {
  const chips = Array.from(document.querySelectorAll('.option-chip'));
  chips.forEach((chip) => chip.classList.toggle('active', chip.dataset.mode === mode));
}

function haversineDistance(origin, destination) {
  return haversine([origin.lng, origin.lat], [destination.lng, destination.lat]);
}

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

const DEMO_GRAPH = {
  nodes: {
    gateway: [72.8347, 18.922],
    taj_palace: [72.8333, 18.9217],
    regal_cinema: [72.8322, 18.9242],
    colaba_causeway: [72.8315, 18.922],
    mantralaya: [72.8258, 18.9298],
    nariman_point: [72.8208, 18.925],
    marine_drive_south: [72.8235, 18.932],
    marine_drive_mid: [72.825, 18.945],
    marine_drive_north: [72.818, 18.96],
    cst_station: [72.8355, 18.94],
    mumbai_uni: [72.83, 18.927],
    mumbai_center: [72.8777, 18.9667],
    highway_nasik: [73.7898, 19.9975],
    highway_dhule: [74.7749, 20.9042],
    highway_indore: [75.8577, 22.7196],
    highway_jabalpur: [79.9864, 23.1608],
    prayagraj_junction: [81.8463, 25.4358],
    highway_vapi: [72.9022, 20.3851],
    highway_surat: [72.8311, 21.1702],
    highway_vadodara: [73.1812, 22.3072],
    highway_udaipur: [73.7125, 24.5854],
    highway_jaipur: [75.7873, 26.9124],
    delhi_south: [77.209, 28.5355],
    delhi_center: [77.1025, 28.7041],
  },
  edges: {
    gateway: [
      { to: 'taj_palace', dist: 150, time: 30, type: 'primary' },
      { to: 'regal_cinema', dist: 350, time: 60, type: 'secondary' },
    ],
    taj_palace: [
      { to: 'gateway', dist: 150, time: 30, type: 'primary' },
      { to: 'colaba_causeway', dist: 200, time: 40, type: 'secondary' },
      { to: 'mumbai_uni', dist: 350, time: 70, type: 'secondary' },
    ],
    regal_cinema: [
      { to: 'gateway', dist: 350, time: 60, type: 'secondary' },
      { to: 'mantralaya', dist: 800, time: 150, type: 'primary' },
      { to: 'cst_station', dist: 1100, time: 200, type: 'primary' },
    ],
    colaba_causeway: [
      { to: 'taj_palace', dist: 200, time: 40, type: 'secondary' },
      { to: 'mumbai_uni', dist: 300, time: 60, type: 'secondary' },
    ],
    mumbai_uni: [
      { to: 'taj_palace', dist: 350, time: 70, type: 'secondary' },
      { to: 'mantralaya', dist: 400, time: 80, type: 'primary' },
    ],
    mantralaya: [
      { to: 'regal_cinema', dist: 800, time: 150, type: 'primary' },
      { to: 'nariman_point', dist: 600, time: 100, type: 'primary' },
      { to: 'marine_drive_south', dist: 400, time: 80, type: 'primary' },
    ],
    nariman_point: [
      { to: 'mantralaya', dist: 600, time: 100, type: 'primary' },
      { to: 'marine_drive_south', dist: 500, time: 90, type: 'primary' },
    ],
    marine_drive_south: [
      { to: 'mantralaya', dist: 400, time: 80, type: 'primary' },
      { to: 'marine_drive_mid', dist: 1200, time: 200, type: 'primary' },
    ],
    marine_drive_mid: [
      { to: 'marine_drive_south', dist: 1200, time: 200, type: 'primary' },
      { to: 'marine_drive_north', dist: 1500, time: 250, type: 'primary' },
      { to: 'cst_station', dist: 1000, time: 180, type: 'secondary' },
    ],
    marine_drive_north: [
      { to: 'marine_drive_mid', dist: 1500, time: 250, type: 'primary' },
      { to: 'mumbai_center', dist: 2500, time: 500, type: 'primary' },
    ],
    cst_station: [
      { to: 'regal_cinema', dist: 1100, time: 200, type: 'primary' },
      { to: 'marine_drive_mid', dist: 1000, time: 180, type: 'secondary' },
      { to: 'mumbai_center', dist: 3000, time: 600, type: 'primary' },
    ],
    mumbai_center: [
      { to: 'cst_station', dist: 3000, time: 600, type: 'primary' },
      { to: 'marine_drive_north', dist: 2500, time: 500, type: 'primary' },
      { to: 'highway_vapi', dist: 170000, time: 10800, type: 'motorway', toll: true },
      { to: 'highway_nasik', dist: 165000, time: 10800, type: 'motorway' },
    ],
    highway_nasik: [
      { to: 'mumbai_center', dist: 165000, time: 10800, type: 'motorway' },
      { to: 'highway_dhule', dist: 90000, time: 5400, type: 'motorway' },
    ],
    highway_dhule: [
      { to: 'highway_nasik', dist: 90000, time: 5400, type: 'motorway' },
      { to: 'highway_indore', dist: 200000, time: 12000, type: 'motorway' },
    ],
    highway_indore: [
      { to: 'highway_dhule', dist: 200000, time: 12000, type: 'motorway' },
      { to: 'highway_jabalpur', dist: 500000, time: 30000, type: 'motorway' },
    ],
    highway_jabalpur: [
      { to: 'highway_indore', dist: 500000, time: 30000, type: 'motorway' },
      { to: 'prayagraj_junction', dist: 360000, time: 21600, type: 'motorway' },
    ],
    prayagraj_junction: [
      { to: 'highway_jabalpur', dist: 360000, time: 21600, type: 'motorway' },
    ],
    highway_vapi: [
      { to: 'mumbai_center', dist: 170000, time: 10800, type: 'motorway', toll: true },
      { to: 'highway_surat', dist: 110000, time: 7200, type: 'motorway', toll: true },
    ],
    highway_surat: [
      { to: 'highway_vapi', dist: 110000, time: 7200, type: 'motorway', toll: true },
      { to: 'highway_vadodara', dist: 150000, time: 9000, type: 'motorway', toll: true },
    ],
    highway_vadodara: [
      { to: 'highway_surat', dist: 150000, time: 9000, type: 'motorway', toll: true },
      { to: 'highway_udaipur', dist: 280000, time: 18000, type: 'motorway', toll: true },
    ],
    highway_udaipur: [
      { to: 'highway_vadodara', dist: 280000, time: 18000, type: 'motorway', toll: true },
      { to: 'highway_jaipur', dist: 390000, time: 25200, type: 'motorway', toll: true },
    ],
    highway_jaipur: [
      { to: 'highway_udaipur', dist: 390000, time: 25200, type: 'motorway', toll: true },
      { to: 'delhi_south', dist: 270000, time: 16200, type: 'motorway', toll: true },
    ],
    delhi_south: [
      { to: 'highway_jaipur', dist: 270000, time: 16200, type: 'motorway', toll: true },
      { to: 'delhi_center', dist: 15000, time: 1200, type: 'primary' },
    ],
    delhi_center: [
      { to: 'delhi_south', dist: 15000, time: 1200, type: 'primary' },
    ],
  },
};

window.addEventListener('beforeunload', () => mapView.destroy());
init().catch(console.error);

async function setupHardwareTelemetry() {
  const container = document.getElementById('hardware-telemetry');
  if (!container) return;
  
  container.classList.remove('hidden');

  function updateBatteryUI(level, charging) {
    const batteryElem = document.getElementById('telemetry-battery');
    if (!batteryElem) return;
    batteryElem.textContent = `${Math.round(level)}%${charging ? " (charging)" : ""}`;
    const batteryItem = batteryElem.parentElement;
    batteryItem.className = 'telemetry-item';
    if (level < 15) {
      batteryItem.classList.add('critical');
    } else if (level < 30) {
      batteryItem.classList.add('warning');
    }
  }

  async function updateTelemetry() {
    try {
      const telemetry = await ai.getTelemetry();
      const thermalElem = document.getElementById('telemetry-thermal');
      if (thermalElem) {
        const thermalValue = telemetry.thermalStatus || 'Normal';
        thermalElem.textContent = thermalValue;
        const thermalItem = thermalElem.parentElement;
        thermalItem.className = 'telemetry-item';
        if (['critical', 'overheating', 'throttling'].includes(thermalValue.toLowerCase())) {
          thermalItem.classList.add('critical');
        } else if (['fair', 'moderate', 'warm'].includes(thermalValue.toLowerCase())) {
          thermalItem.classList.add('warning');
        }
      }
      
      if (telemetry.batteryLevel !== undefined && telemetry.batteryLevel !== null) {
        updateBatteryUI(telemetry.batteryLevel, telemetry.charging || false);
      }
    } catch (e) {
      console.warn('Native telemetry failed:', e);
    }
  }

  // Hook into Web Battery API if available for web preview parity
  if (navigator.getBattery) {
    try {
      const battery = await navigator.getBattery();
      updateBatteryUI(battery.level * 100, battery.charging);
      battery.addEventListener('levelchange', () => updateBatteryUI(battery.level * 100, battery.charging));
      battery.addEventListener('chargingchange', () => updateBatteryUI(battery.level * 100, battery.charging));
    } catch (e) {
      console.warn('Web Battery API failed:', e);
    }
  }

  // Periodically update via native telemetry
  updateTelemetry();
  setInterval(updateTelemetry, 5000);
}



window.getNavigationHealth = function getNavigationHealth() {
  const routingStatus = routing.getStatus();
  return {
    routingBackend: routingStatus.backend,
    graphPackLoaded: Boolean(routingStatus.graphPackLoaded || state.offlineRegions.find((r) => r.id === state.activeRegion)?.downloaded),
    graphVersion: (state.offlineRegions.find((r) => r.id === state.activeRegion)?.dataVersion) || null,
    gpsStable: Boolean(navSession?.lastMatch),
    mapMatchConfidence: navSession?.lastMatch ? Math.max(0, 1 - ((navSession.lastMatch.lateralMeters || 0) / 60)) : 0,
    fallbackActive: routingStatus.backend !== 'graphhopper-native',
    activeRegion: state.activeRegion,
    offlineGuidanceReady: Boolean(state.offlineRegions.find((r) => r.id === state.activeRegion)?.downloaded),
  };
};


window.getAIHealth = function getAIHealth() {
  const providerStatus = ai.getProviderStatus?.() || {};
  const navHealth = window.getNavigationHealth?.() || {};
  return {
    provider: ai.getProviderLabel?.() || 'Unknown',
    supportsNativeMelange: Boolean(providerStatus.supportsNativeMelange),
    fallbackActive: !Boolean(providerStatus.supportsNativeMelange),
    fallbackReason: providerStatus.fallbackReason || null,
    runtime: providerStatus.runtime || 'unknown',
    semanticModelName: providerStatus.semanticModelName || providerStatus.models?.semantic || null,
    routingBackend: navHealth.routingBackend || state.routingBackend,
  };
};



























