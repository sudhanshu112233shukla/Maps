import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/main.css';

import { MapView } from './map/MapView.js';
import { AStarRouter } from './routing/AStarRouter.js';
import { Geocoder } from './routing/Geocoder.js';
import { GPSTracker } from './gps/GPSTracker.js';
import { AIAssistant } from './ai/AIAssistant.js';
import { OfflineRegionStore } from './offline/OfflineRegionStore.js';
import { OfflineDataLoader } from './offline/OfflineDataLoader.js';
import { RegionProvisioner } from './offline/RegionProvisioner.js';
import { registerServiceWorker } from './registerServiceWorker.js';

const state = {
  activeRegion: 'india',
  origin: null,
  destination: null,
  currentRoute: null,
  routeMode: 'fastest',
  isNavigating: false,
  aiHistory: [],
  offlineRegions: [],
  searchBackend: 'js-fallback',
};

const mapView = new MapView('map');
const router = new AStarRouter({ vehicleProfile: 'automobile' });
const geocoder = new Geocoder({ allowOnlineFallback: false, region: 'india' });
const gps = new GPSTracker();
const ai = new AIAssistant({ locale: 'en-US' });
const offlineStore = new OfflineRegionStore();
const offlineDataLoader = new OfflineDataLoader();
const regionProvisioner = new RegionProvisioner({ offlineDataLoader, offlineStore });

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

  mapView.init(state.activeRegion, offlineStore.getSourceConfig(state.activeRegion));
  await syncRegionAssets(state.activeRegion, { recenter: false });

  await bootstrapLocation();
  setupSearchUI();
  setupQuickSearch();
  setupRouteUI();
  setupNavUI();
  setupAIPanel();
  setupOfflineManager();
  setupFABs();
  registerServiceWorker();

  gps.startWatching(handlePositionUpdate);
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

  const { graph, pois } = await offlineDataLoader.loadRegionAssets(regionId, {
    graphFallback: DEMO_GRAPH,
    poiFallback: [],
  });

  geocoder.setDataset(pois);
  await geocoder.prepareRegionIndex({
    regionId,
    graphPath: regionMeta?.graphPath || null,
    poiPath: regionMeta?.poiPath || null,
    dataVersion: regionMeta?.dataVersion || null,
  });
  state.searchBackend = geocoder.getBackendStatus().backend;
  await router.loadGraph(graph);

  if (recenter) {
    mapView.setRegion(regionId);
  }
}

function handlePositionUpdate(position) {
  mapView.setUserLocation(position.lng, position.lat);

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
      mapView.setUserLocation(position.lng, position.lat);
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
    chip.addEventListener('click', async () => {
      const query = chip.dataset.query;
      searchInput.value = chip.textContent.trim();
      const results = await geocoder.search(query);
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
  const results = await geocoder.search(query);
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
    element.addEventListener('click', async () => {
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
  if (!state.destination && destInput.value.trim().length >= 2) {
    const results = await geocoder.search(destInput.value, 1);
    if (results[0]) {
      state.destination = {
        name: results[0].name,
        lng: results[0].lng,
        lat: results[0].lat,
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

  if (!state.origin) return;

  let route = null;
  if (router.loaded) {
    route = await router.routeLatLng(
      state.origin.lng,
      state.origin.lat,
      state.destination.lng,
      state.destination.lat,
      state.routeMode,
    );
  }

  if (!route) {
    route = buildFallbackRoute(state.origin, state.destination);
  }

  state.currentRoute = route;
  mapView.drawRoute(route.geojson);
  showRoutePanel(route);
}

function buildFallbackRoute(origin, destination) {
  const steps = 20;
  const coords = Array.from({ length: steps + 1 }, (_, index) => [
    origin.lng + (destination.lng - origin.lng) * (index / steps),
    origin.lat + (destination.lat - origin.lat) * (index / steps),
  ]);

  const distance = haversineDistance(origin, destination);
  const duration = distance / (75 * 1000 / 3600);

  return {
    coords,
    distance: Math.round(distance),
    duration: Math.round(duration),
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { distance, duration },
        },
      ],
    },
  };
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
    fastest: { text: 'FASTEST', background: '#eff6ff', color: '#1d4ed8' },
    safest: { text: 'SAFEST', background: '#ecfdf5', color: '#047857' },
    eco: { text: 'ECO', background: '#fffbeb', color: '#b45309' },
    'no-toll': { text: 'NO TOLL', background: '#f8fafc', color: '#334155' },
  };

  const badge = badgeByMode[state.routeMode] || badgeByMode.fastest;
  safetyBadge.textContent = badge.text;
  safetyBadge.style.background = badge.background;
  safetyBadge.style.color = badge.color;

  const instructions = router.generateInstructions(route.path || [], route.coords || []);
  renderTurnByTurn(
    instructions.length > 0
      ? instructions
      : [
          { text: `Head towards ${state.destination.name}`, dist: route.distance, icon: 'straight' },
          { text: `Arrive at ${state.destination.name}`, dist: 0, icon: 'arrive' },
        ],
  );

  routePanel.classList.remove('hidden');
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
  if (!state.currentRoute) return;

  state.isNavigating = true;
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

function updateHUD(route) {
  hudDistance.textContent = `${(route.distance / 1000).toFixed(1)} km`;
  hudInstruction.textContent = `Head toward ${state.destination?.name || 'destination'}`;
  hudTime.textContent = formatDuration(route.duration);

  const eta = new Date();
  eta.setSeconds(eta.getSeconds() + route.duration);
  hudArrival.textContent = `ETA ${eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function updateNavHUD(position) {
  mapView.setUserLocation(position.lng, position.lat);
  if (state.currentRoute) {
    updateHUD(state.currentRoute);
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
      ? `${providerLabel} active`
      : `${providerLabel} ready`;
    addAIMessage(
      'assistant',
      providerStatus?.supportsNativeMelange
        ? 'Melange is active for local navigation intelligence.'
        : 'Native plugin bridge is active. Replace the bridge internals with Melange runtime calls to enable full on-device inference.',
    );
  } catch {
    aiStatusDot.style.background = '#ef4444';
    aiProviderNote.textContent = 'Assistant unavailable';
    addAIMessage('assistant', 'The AI layer could not be initialized.');
  } finally {
    aiLoadingOverlay.classList.add('hidden');
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
    aiPanel.classList.add('hidden');
    return `Routing to ${results[0].name} in ${parsed.mode} mode.`;
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
    aiPanel.classList.add('hidden');
    return `Routing to nearby ${parsed.poi.replace('_', ' ')}: ${nearby[0].name}.`;
  }

  return 'Tell me where you want to go or what kind of stop you need.';
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
      const transcript = await ai.transcribeNavigationCommand();
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
                     <div class="region-meta">${region.verifiedAt ? `Verified ${new Date(region.verifiedAt).toLocaleDateString()}` : ''}</div>`
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
            </div>
          </div>
        `,
      )
      .join('');
  };

  mainMenuButton.addEventListener('click', () => {
    renderRegions();
    offlineManager.classList.remove('hidden');
    setTimeout(() => offlineManager.classList.add('visible'), 10);
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
      const patch = await regionProvisioner.provisionRegion(regionId, async (progress) => {
        progressBar.style.width = `${progress}%`;
        state.offlineRegions = await offlineStore.updateProgress(regionId, progress);
      });

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

