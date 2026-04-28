/**
 * main.js — App Orchestrator
 * Wires together MapView, Router, GPS, AI, Geocoder, and all UI
 */

import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/main.css';

import { MapView }     from './map/MapView.js';
import { AStarRouter } from './routing/AStarRouter.js';
import { Geocoder }    from './routing/Geocoder.js';
import { GPSTracker }  from './gps/GPSTracker.js';
import { AIAssistant } from './ai/AIAssistant.js';

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  activeRegion: 'india',
  origin: null,        // { name, lng, lat }
  destination: null,   // { name, lng, lat }
  currentRoute: null,
  routeMode: 'fastest',
  isNavigating: false,
  aiHistory: []
};

// ─── Instantiate core modules ────────────────────────────────────────────────
const mapView   = new MapView('map');
const router    = new AStarRouter();
const geocoder  = new Geocoder();
const gps       = new GPSTracker();
const ai        = new AIAssistant();

// ─── UI Elements ─────────────────────────────────────────────────────────────
const searchInput      = document.getElementById('search-input');
const originInput      = document.getElementById('origin-input');
const destInput        = document.getElementById('dest-input');
const suggestionsPanel = document.getElementById('suggestions-panel');
const suggestionsList  = document.getElementById('suggestions-list');
const placePanel       = document.getElementById('place-panel');
const routePanel       = document.getElementById('route-panel');
const routingPanelBox  = document.getElementById('routing-panel');
const routeTime        = document.getElementById('route-time');
const routeDistance    = document.getElementById('route-distance');
const safetyBadge      = document.getElementById('safety-badge');
const placeName        = document.getElementById('sheet-place-name');
const placeSubtitle    = document.getElementById('sheet-place-subtitle');
const turnList         = document.getElementById('turn-by-turn-list');
const clearSearchBtn   = document.getElementById('clear-search-btn');
const navHud           = document.getElementById('nav-hud');
const hudDistance      = document.getElementById('hud-distance');
const hudInstruction   = document.getElementById('hud-instruction');
const hudTime          = document.getElementById('hud-time');
const hudArrival       = document.getElementById('hud-arrival');
const aiPanel          = document.getElementById('ai-panel');
const aiMessages       = document.getElementById('ai-messages');
const aiInput          = document.getElementById('ai-input');
const aiLoadingOverlay = document.getElementById('ai-loading-overlay');
const aiProgressFill   = document.getElementById('ai-progress-fill');
const aiLoadingText    = document.getElementById('ai-loading-text');
const regionChips      = document.querySelectorAll('#region-chips .chip');
let activeInput;

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  // Init map
  mapView.init(state.activeRegion);

  // Load a demo graph (simplified for initial testing)
  // In production: load from IndexedDB or bundled binary
  await loadDemoGraph();

  // Start GPS
  try {
    await gps.requestPermission();
    const pos = await gps.getCurrentPosition();
    if (pos) {
      state.origin = { name: 'My Location', lng: pos.lng, lat: pos.lat };
      mapView.setUserLocation(pos.lng, pos.lat);
      mapView.flyTo(pos.lng, pos.lat, 12);
    }
  } catch (e) {
    console.warn('[GPS] Permission denied or unavailable');
  }

  gps.startWatching((pos) => {
    mapView.setUserLocation(pos.lng, pos.lat);
    
    // Auto-update origin if it was snapped to "Current Location"
    if (state.origin && state.origin.name === 'Current Location') {
      state.origin = { name: 'Current Location', lng: pos.lng, lat: pos.lat };
      if (state.currentRoute && !state.isNavigating) {
        // Refresh route as user moves to the starting point
        calculateRoute();
      }
    }

    if (state.isNavigating) updateNavHUD(pos);
  });

  // Wire up UI events
  setupSearchUI();
  setupQuickSearch(); // New: Handles Restaurants/Hotels chips
  setupRouteUI();
  setupNavUI();
  setupAIPanel();
  setupOfflineManager();
  setupFABs();

  // Smart Auto-Download: Get location and pre-fetch regional map
  await handleAutoDownload();

  console.log('[App] Initialized');
}

async function handleAutoDownload() {
  try {
    const pos = await gps.getCurrentPosition();
    if (!pos) return;

    // Determine region from coordinates
    let targetRegion = null;
    if (pos.lng > 68 && pos.lng < 97 && pos.lat > 8 && pos.lat < 37) targetRegion = 'india';
    else if (pos.lng > -125 && pos.lng < -67 && pos.lat > 24 && pos.lat < 49) targetRegion = 'usa';
    else if (pos.lng > 129 && pos.lng < 145 && pos.lat > 31 && pos.lat < 45) targetRegion = 'japan';

    if (targetRegion) {
      const region = OFFLINE_REGIONS.find(r => r.id === targetRegion);
      if (region && !region.downloaded) {
        console.log(`[Offline] Auto-downloading region for current location: ${targetRegion}`);
        window.startDownload(targetRegion);
      }
    }
  } catch (e) {
    console.warn('[Offline] Auto-download failed:', e);
  }
}

// ─── Demo Graph Loader ────────────────────────────────────────────────────────
async function loadDemoGraph() {
  // EXTENDED STREET GRAPH for Mumbai (Ensures Road-Following)
  const demoGraph = {
    nodes: {
      'gateway': [72.8347, 18.9220],
      'taj_palace': [72.8333, 18.9217],
      'regal_cinema': [72.8322, 18.9242],
      'colaba_causeway': [72.8315, 18.9220],
      'mantralaya': [72.8258, 18.9298],
      'nariman_point': [72.8208, 18.9250],
      'marine_drive_south': [72.8235, 18.9320],
      'marine_drive_mid': [72.8250, 18.9450],
      'marine_drive_north': [72.8180, 18.9600],
      'cst_station': [72.8355, 18.9400],
      'mumbai_uni': [72.8300, 18.9270],
      'mumbai_center': [72.8777, 18.9667],
      // 🇮🇳 National Highway Nodes
      'highway_vapi': [72.9022, 20.3851],
      'highway_surat': [72.8311, 21.1702],
      'highway_vadodara': [73.1812, 22.3072],
      'highway_udaipur': [73.7125, 24.5854],
      'highway_jaipur': [75.7873, 26.9124],
      'delhi_south': [77.2090, 28.5355],
      'delhi_center': [77.1025, 28.7041]
    },
    edges: {
      'gateway': [
        { to: 'taj_palace', dist: 150, time: 30, type: 'primary' },
        { to: 'regal_cinema', dist: 350, time: 60, type: 'secondary' }
      ],
      'taj_palace': [
        { to: 'gateway', dist: 150, time: 30, type: 'primary' },
        { to: 'colaba_causeway', dist: 200, time: 40, type: 'secondary' },
        { to: 'mumbai_uni', dist: 350, time: 70, type: 'secondary' }
      ],
      'regal_cinema': [
        { to: 'gateway', dist: 350, time: 60, type: 'secondary' },
        { to: 'mantralaya', dist: 800, time: 150, type: 'primary' },
        { to: 'cst_station', dist: 1100, time: 200, type: 'primary' }
      ],
      'colaba_causeway': [
        { to: 'taj_palace', dist: 200, time: 40, type: 'secondary' },
        { to: 'mumbai_uni', dist: 300, time: 60, type: 'secondary' }
      ],
      'mumbai_uni': [
        { to: 'taj_palace', dist: 350, time: 70, type: 'secondary' },
        { to: 'mantralaya', dist: 400, time: 80, type: 'primary' }
      ],
      'mantralaya': [
        { to: 'regal_cinema', dist: 800, time: 150, type: 'primary' },
        { to: 'nariman_point', dist: 600, time: 100, type: 'primary' },
        { to: 'marine_drive_south', dist: 400, time: 80, type: 'primary' }
      ],
      'nariman_point': [
        { to: 'mantralaya', dist: 600, time: 100, type: 'primary' },
        { to: 'marine_drive_south', dist: 500, time: 90, type: 'primary' }
      ],
      'marine_drive_south': [
        { to: 'mantralaya', dist: 400, time: 80, type: 'primary' },
        { to: 'marine_drive_mid', dist: 1200, time: 200, type: 'primary' }
      ],
      'marine_drive_mid': [
        { to: 'marine_drive_south', dist: 1200, time: 200, type: 'primary' },
        { to: 'marine_drive_north', dist: 1500, time: 250, type: 'primary' },
        { to: 'cst_station', dist: 1000, time: 180, type: 'secondary' }
      ],
      'marine_drive_north': [
        { to: 'marine_drive_mid', dist: 1500, time: 250, type: 'primary' },
        { to: 'mumbai_center', dist: 2500, time: 500, type: 'primary' }
      ],
      'cst_station': [
        { to: 'regal_cinema', dist: 1100, time: 200, type: 'primary' },
        { to: 'marine_drive_mid', dist: 1000, time: 180, type: 'secondary' },
        { to: 'mumbai_center', dist: 3000, time: 600, type: 'primary' }
      ],
      'mumbai_center': [
        { to: 'cst_station', dist: 3000, time: 600, type: 'primary' },
        { to: 'marine_drive_north', dist: 2500, time: 500, type: 'primary' },
        { to: 'highway_vapi', dist: 170000, time: 10800, type: 'motorway' }
      ],
      'highway_vapi': [
        { to: 'mumbai_center', dist: 170000, time: 10800, type: 'motorway' },
        { to: 'highway_surat', dist: 110000, time: 7200, type: 'motorway' }
      ],
      'highway_surat': [
        { to: 'highway_vapi', dist: 110000, time: 7200, type: 'motorway' },
        { to: 'highway_vadodara', dist: 150000, time: 9000, type: 'motorway' }
      ],
      'highway_vadodara': [
        { to: 'highway_surat', dist: 150000, time: 9000, type: 'motorway' },
        { to: 'highway_udaipur', dist: 280000, time: 18000, type: 'motorway' }
      ],
      'highway_udaipur': [
        { to: 'highway_vadodara', dist: 280000, time: 18000, type: 'motorway' },
        { to: 'highway_jaipur', dist: 390000, time: 25200, type: 'motorway' }
      ],
      'highway_jaipur': [
        { to: 'highway_udaipur', dist: 390000, time: 25200, type: 'motorway' },
        { to: 'delhi_south', dist: 270000, time: 16200, type: 'motorway' }
      ],
      'delhi_south': [
        { to: 'highway_jaipur', dist: 270000, time: 16200, type: 'motorway' },
        { to: 'delhi_center', dist: 15000, time: 1200, type: 'primary' }
      ],
      'delhi_center': [
        { to: 'delhi_south', dist: 15000, time: 1200, type: 'primary' }
      ]
    }
  };
  await router.loadGraph(demoGraph);
}

// ─── Search UI ────────────────────────────────────────────────────────────────
function setupSearchUI() {
  let searchTimeout;
  activeInput = searchInput;

  const focusHandler = (input) => {
    activeInput = input;
    suggestionsPanel.classList.remove('hidden');
    if (input.value.length >= 2) triggerSearch(input.value);
  };

  const inputHandler = (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => triggerSearch(e.target.value), 350);
  };

  searchInput.addEventListener('input', (e) => {
    inputHandler(e);
    if (e.target.value.length > 0) clearSearchBtn.classList.remove('hidden');
    else clearSearchBtn.classList.add('hidden');
  });
  originInput.addEventListener('input', inputHandler);
  destInput.addEventListener('input', inputHandler);

  searchInput.addEventListener('focus', () => focusHandler(searchInput));
  originInput.addEventListener('focus', () => focusHandler(originInput));
  destInput.addEventListener('focus', () => focusHandler(destInput));

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    suggestionsPanel.classList.add('hidden');
    placePanel.classList.remove('visible');
    mapView.clearMarkers();
  });

  const blurHandler = () => {
    setTimeout(() => suggestionsPanel.classList.add('hidden'), 200);
  };

  searchInput.addEventListener('blur', blurHandler);
  originInput.addEventListener('blur', blurHandler);
  destInput.addEventListener('blur', blurHandler);

  document.getElementById('directions-btn').addEventListener('click', () => {
    placePanel.classList.remove('visible');
    routingPanelBox.style.display = 'block';
    destInput.value = state.destination.name;
    calculateRoute();
  });

  document.getElementById('locate-btn').addEventListener('click', async () => {
    try {
      const pos = await gps.getCurrentPosition();
      if (pos) {
        mapView.flyTo(pos.lng, pos.lat, 14);
        mapView.setUserLocation(pos.lng, pos.lat);
        state.origin = { name: 'Current Location', lng: pos.lng, lat: pos.lat };
      }
    } catch (e) { alert('Location not available'); }
  });
}

function setupQuickSearch() {
  document.querySelectorAll('.q-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const query = chip.dataset.query;
      searchInput.value = chip.textContent.trim();
      const results = await geocoder.search(query);
      if (results.length > 0) {
        renderSuggestions(results);
        suggestionsPanel.classList.remove('hidden');
      }
    });
  });
}

async function triggerSearch(query) {
  if (query.length < 2) { suggestionsList.innerHTML = ''; return; }
  const results = await geocoder.search(query);
  renderSuggestions(results);
}

function renderSuggestions(results) {
  suggestionsList.innerHTML = results.map((r, i) => `
    <div class="suggestion-item" data-idx="${i}" id="suggestion-${i}" style="animation: fadeSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards ${i * 0.05}s; opacity: 0;">
      <div class="suggestion-icon">${r.emoji || '📍'}</div>
      <div>
        <div class="suggestion-name">${r.name}</div>
        <div class="suggestion-addr">${r.fullName ? r.fullName.split(',').slice(1, 3).join(',').trim() : ''}</div>
      </div>
    </div>
  `).join('');

  // Add the animation keyframes dynamically if not present
  if (!document.getElementById('anim-styles')) {
    const style = document.createElement('style');
    style.id = 'anim-styles';
    style.innerHTML = `
      @keyframes fadeSlideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  suggestionsList.querySelectorAll('.suggestion-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      if (activeInput === originInput) {
        state.origin = { name: results[i].name, lng: results[i].lng, lat: results[i].lat };
        originInput.value = results[i].name;
      } else if (activeInput === destInput) {
        state.destination = { name: results[i].name, lng: results[i].lng, lat: results[i].lat };
        destInput.value = results[i].name;
        calculateRoute();
      } else {
        showPlaceInfo(results[i]);
      }
      suggestionsPanel.classList.add('hidden');
    });
  });
}

function showPlaceInfo(place) {
  state.destination = { name: place.name, lng: place.lng, lat: place.lat };
  searchInput.value = place.name;
  clearSearchBtn.classList.remove('hidden');

  placeName.textContent = place.name;
  placeSubtitle.textContent = place.fullName || "Maharashtra, India";

  mapView.clearMarkers();
  mapView.addPinMarker(place.lng, place.lat, place.name);
  mapView.flyTo(place.lng, place.lat, 15);

  placePanel.classList.add('visible');
}

async function selectDestination(place) {
  state.destination = { name: place.name, lng: place.lng, lat: place.lat };
  searchInput.value = place.name;
  suggestionsPanel.classList.add('hidden');

  mapView.clearMarkers();
  mapView.addPinMarker(place.lng, place.lat, place.name);
  if (destName) destName.textContent = place.name;

  await calculateRoute();
}

// ─── Routing ─────────────────────────────────────────────────────────────────
async function calculateRoute() {
  // 🔍 Dynamic Destination Geocoding
  if (!state.destination && destInput.value.length > 2) {
    const results = await geocoder.search(destInput.value);
    if (results.length > 0) {
      state.destination = { name: results[0].name, lng: results[0].lng, lat: results[0].lat };
    }
  }
  
  if (!state.destination) return;

  // If still no origin, use map center
  if (!state.origin) {
    const center = mapView.getMap().getCenter();
    state.origin = { name: 'Current Location', lng: center.lng, lat: center.lat };
  }

  // Try A* router (works when graph is loaded)
  let route = null;
  if (router.loaded) {
    route = await router.routeLatLng(
      state.origin.lng, state.origin.lat,
      state.destination.lng, state.destination.lat,
      state.routeMode
    );
  }

  // Fallback: straight-line "route" for demo purposes
  if (!route) {
    route = buildStraightLineRoute(state.origin, state.destination);
  }

  state.currentRoute = route;
  mapView.drawRoute(route.geojson);
  showRoutePanel(route);
}

function buildStraightLineRoute(origin, dest) {
  // Interpolate points along the straight line
  const steps = 20;
  const coords = Array.from({ length: steps + 1 }, (_, i) => [
    origin.lng + (dest.lng - origin.lng) * (i / steps),
    origin.lat + (dest.lat - origin.lat) * (i / steps)
  ]);

  // Estimate distance & time (haversine)
  const R = 6371000;
  const dLat = (dest.lat - origin.lat) * Math.PI / 180;
  const dLng = (dest.lng - origin.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(origin.lat * Math.PI / 180) * Math.cos(dest.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const duration = dist / (80 * 1000 / 3600); // assume 80 km/h avg

  return {
    coords,
    distance: Math.round(dist),
    duration: Math.round(duration),
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { distance: dist, duration }
      }]
    }
  };
}

// ─── Route Panel ─────────────────────────────────────────────────────────────
function setupRouteUI() {
  document.querySelectorAll('.option-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.option-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.routeMode = btn.dataset.mode;
      if (state.destination) calculateRoute();
    });
  });

  document.getElementById('start-navigate-btn').addEventListener('click', startNavigation);
}

function showRoutePanel(route) {
  const mins = Math.round(route.duration / 60);
  const km = (route.distance / 1000).toFixed(1);

  routeTime.textContent = mins >= 60
    ? `${Math.floor(mins / 60)}h ${mins % 60}m`
    : `${mins} min`;
  routeDistance.textContent = `${km} km`;
  
  if (safetyBadge) {
    safetyBadge.textContent = state.routeMode === 'safest' ? 'OPTIMAL SAFETY RANK' : 'STANDARD ROUTE';
    safetyBadge.style.background = state.routeMode === 'safest' ? '#e6f4ea' : '#f1f3f4';
    safetyBadge.style.color = state.routeMode === 'safest' ? '#1e8e3e' : '#70757a';
  }

  // Generate turn-by-turn
  const instructions = router.generateInstructions(route.path || [], route.coords || []);
  renderTurnByTurn(instructions.length ? instructions : [
    { text: `Head towards ${state.destination.name}`, dist: route.distance, icon: 'straight' },
    { text: `Arrive at ${state.destination.name}`, dist: 0, icon: 'arrive' }
  ]);

  routePanel.classList.remove('hidden');
  setTimeout(() => routePanel.classList.add('visible'), 50);

  // If already navigating, update the HUD immediately
  if (state.isNavigating) {
    updateHUD(route);
  }
}

function updateHUD(route) {
  const mins = Math.round(route.duration / 60);
  const now = new Date();
  now.setSeconds(now.getSeconds() + route.duration);
  
  hudTime.textContent = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins} min`;
  hudArrival.textContent = `ETA ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  hudInstruction.textContent = `Head towards ${state.destination?.name || 'destination'}`;
  hudDistance.textContent = `${(route.distance / 1000).toFixed(1)} km`;
}

function renderTurnByTurn(instructions) {
  const iconSVG = {
    straight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
    right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
    left: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M11 6L5 12l6 6"/></svg>`,
    arrive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
    start: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>`
  };

  turnList.innerHTML = instructions.map(ins => `
    <div class="turn-item">
      <div class="turn-icon">${iconSVG[ins.icon] || iconSVG.straight}</div>
      <div class="turn-text">${ins.text}</div>
      ${ins.dist > 0 ? `<div class="turn-dist">${ins.dist >= 1000 ? (ins.dist / 1000).toFixed(1) + ' km' : ins.dist + ' m'}</div>` : ''}
    </div>
  `).join('');
}

function setupNavUI() {
  document.getElementById('hud-exit-btn').addEventListener('click', stopNavigation);
  
  // Create AR button if not in HTML
  let arBtn = document.getElementById('ar-mode-btn');
  if (!arBtn) {
    arBtn = document.createElement('button');
    arBtn.id = 'ar-mode-btn';
    arBtn.className = 'icon-btn';
    arBtn.style.cssText = 'background: #000; color: #fff; margin-top: 10px; width: auto; padding: 0 16px; border-radius: 20px; font-size: 12px; font-weight: 700;';
    arBtn.textContent = 'AR VIEW';
    document.getElementById('hud-eta').appendChild(arBtn);
  }
  if (arBtn) {
    arBtn.addEventListener('click', async () => {
      const arView = document.getElementById('ar-view');
      const arVideo = document.getElementById('ar-video');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        arVideo.srcObject = stream;
        arView.classList.add('active');
      } catch (e) {
        alert('Camera access denied or not available.');
      }
    });
  }

  const exitArBtn = document.getElementById('exit-ar-btn');
  if (exitArBtn) {
    exitArBtn.addEventListener('click', () => {
      const arView = document.getElementById('ar-view');
      const arVideo = document.getElementById('ar-video');
      const stream = arVideo.srcObject;
      if (stream) stream.getTracks().forEach(track => track.stop());
      arView.classList.remove('active');
    });
  }
}

function startNavigation() {
  if (!state.currentRoute) return;
  
  state.isNavigating = true;
  routePanel.classList.add('hidden');
  navHud.classList.remove('hidden');
  document.getElementById('ar-mode-btn').style.display = 'flex'; // Show AR button during navigation

  // Show initial instruction
  updateHUD(state.currentRoute);

  // Simulate P2P Mesh Alert after 10s of navigation
  setTimeout(() => {
    const alert = document.getElementById('mesh-alert');
    if (alert) {
      alert.classList.add('visible');
      document.getElementById('mesh-reroute-btn').onclick = () => {
        alert.classList.remove('visible');
        calculateRoute(); // Reroute using dynamic traffic/closure data
      };
    }
  }, 10000);

  // Track map to follow user
  gps.startWatching((pos) => updateNavHUD(pos));
}

function updateNavHUD(pos) {
  if (!state.isNavigating || !state.currentRoute) return;
  mapView.setUserLocation(pos.lng, pos.lat);
  mapView.flyTo(pos.lng, pos.lat, 15);
  // In production: recalculate remaining distance, update instruction
}

function stopNavigation() {
  state.isNavigating = false;
  navHud.classList.add('hidden');
  document.getElementById('ar-mode-btn').style.display = 'none'; // Hide AR button
  mapView.clearRoute();
  mapView.clearMarkers();
  state.destination = null;
  state.currentRoute = null;
  searchInput.value = '';
  routePanel.classList.remove('visible');
  setTimeout(() => routePanel.classList.add('hidden'), 300);
}

// ─── AI Panel ─────────────────────────────────────────────────────────────────
function setupAIPanel() {
  document.getElementById('ai-fab-btn').addEventListener('click', async () => {
    aiPanel.classList.remove('hidden');
    if (!ai.isReady() && !ai.isLoading()) {
      await loadAIModel();
    }
  });

  document.getElementById('ai-close-btn').addEventListener('click', () => {
    aiPanel.classList.add('hidden');
  });

  document.getElementById('ai-send-btn').addEventListener('click', sendAIMessage);
  aiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAIMessage(); });

  // Voice button
  document.getElementById('voice-btn').addEventListener('click', startVoiceInput);
}

async function loadAIModel() {
  aiLoadingOverlay.classList.remove('hidden');

  ai.onProgress((pct, text) => {
    aiProgressFill.style.width = pct + '%';
    aiLoadingText.textContent = text;
  });

  try {
    await ai.load(true); // true = use smaller fallback model for demo
  } catch (e) {
    console.error('[AI] Load failed:', e);
  }

  aiLoadingOverlay.classList.add('hidden');
  addAIMessage('assistant', "Hi! I'm your on-device navigation AI. Ask me for routes, nearby places, or anything about your journey!");
}

async function sendAIMessage() {
  const text = aiInput.value.trim();
  if (!text) return;

  addAIMessage('user', text);
  aiInput.value = '';
  state.aiHistory.push({ role: 'user', content: text });

  // Show thinking indicator
  const thinkingEl = addAIMessage('thinking', '');

  let response;
  if (ai.isReady()) {
    // Try to parse as routing query first
    const parsed = await ai.parseRoutingQuery(text);
    if (parsed.destination || parsed.poi) {
      response = await handleAIRouteQuery(parsed);
    } else {
      response = await ai.chat(text, state.aiHistory);
    }
  } else {
    const parsed = ai._ruleBasedParse(text);
    if (parsed.destination || parsed.poi) {
      response = await handleAIRouteQuery(parsed);
    } else {
      response = ai._ruleBasedChat(text);
    }
  }

  thinkingEl.remove();
  addAIMessage('assistant', response);
  state.aiHistory.push({ role: 'assistant', content: response });
}

async function handleAIRouteQuery(parsed) {
  if (parsed.destination) {
    const results = await geocoder.search(parsed.destination, 1);
    if (results.length > 0) {
      state.routeMode = parsed.mode || 'fastest';
      await selectDestination(results[0]);
      aiPanel.classList.add('hidden');
      return `Navigating to ${results[0].name}! Route mode: ${state.routeMode}`;
    }
    return `I couldn't find "${parsed.destination}" in the current map data. Try a city name.`;
  }
  if (parsed.poi) {
    return `Searching for nearest ${parsed.poi}… POI search will be available once the full map data is loaded.`;
  }
  return "I understand you're looking for directions. Can you specify the destination name?";
}

function addAIMessage(role, text) {
  const el = document.createElement('div');
  el.className = `ai-msg ${role}`;

  if (role === 'thinking') {
    el.innerHTML = `<div class="dot-anim"></div><div class="dot-anim"></div><div class="dot-anim"></div>`;
  } else {
    el.textContent = text;
  }

  aiMessages.appendChild(el);
  aiMessages.scrollTop = aiMessages.scrollHeight;
  return el;
}

function startVoiceInput() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Voice input requires a browser that supports Web Speech API (Chrome/Edge).');
    return;
  }
  const sr = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new sr();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (e) => {
    searchInput.value = e.results[0][0].transcript;
    triggerSearch(searchInput.value);
    suggestionsPanel.classList.remove('hidden');
  };
  recognition.start();
}

// ─── Offline Maps Manager ──────────────────────────────────────────────────────
const OFFLINE_REGIONS = [
  { id: 'india', name: 'India', size: '1.2 GB', downloaded: true },
  { id: 'usa', name: 'United States', size: '4.5 GB', downloaded: false },
  { id: 'japan', name: 'Japan', size: '850 MB', downloaded: false },
  { id: 'uk', name: 'United Kingdom', size: '1.1 GB', downloaded: false },
  { id: 'skorea', name: 'South Korea', size: '420 MB', downloaded: false },
  { id: 'russia', name: 'Russia', size: '3.8 GB', downloaded: false },
  { id: 'australia', name: 'Australia', size: '950 MB', downloaded: false }
];

function setupOfflineManager() {
  const offlineManager = document.getElementById('offline-manager');
  const regionList = document.getElementById('offline-region-list');
  const mainMenuBtn = document.getElementById('main-menu-btn');
  const closeBtn = document.getElementById('offline-close-btn');

  const renderRegions = () => {
    regionList.innerHTML = OFFLINE_REGIONS.map(r => `
      <div class="region-item" id="region-${r.id}">
        <div class="region-info">
          <h3>${r.name}</h3>
          <p>${r.size}</p>
        </div>
        <div style="text-align: right;">
          ${r.downloaded 
            ? `<button class="download-btn downloaded">Downloaded ✓</button>`
            : `<button class="download-btn" onclick="startDownload('${r.id}')">Download</button>
               <div class="progress-bar-container" id="progress-${r.id}">
                 <div class="progress-bar" id="bar-${r.id}"></div>
               </div>`
          }
        </div>
      </div>
    `).join('');
  };

  mainMenuBtn.addEventListener('click', () => {
    renderRegions();
    offlineManager.classList.remove('hidden');
    // small delay to allow display:block to apply before transform
    setTimeout(() => offlineManager.classList.add('visible'), 10);
  });

  closeBtn.addEventListener('click', () => {
    offlineManager.classList.remove('visible');
    setTimeout(() => offlineManager.classList.add('hidden'), 400);
  });

  // Expose global function for the inline onclick handler
  window.startDownload = (regionId) => {
    const region = OFFLINE_REGIONS.find(r => r.id === regionId);
    if (!region || region.downloaded) return;

    const btn = document.querySelector(`#region-${regionId} .download-btn`);
    const progressContainer = document.getElementById(`progress-${regionId}`);
    const bar = document.getElementById(`bar-${regionId}`);

    btn.style.display = 'none';
    progressContainer.style.display = 'block';

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        region.downloaded = true;
        setTimeout(() => renderRegions(), 500); // re-render to show 'Downloaded' state
      }
      bar.style.width = `${Math.min(progress, 100)}%`;
    }, 400);
  };
}

// ─── FABs ─────────────────────────────────────────────────────────────────────
function setupFABs() {
  document.getElementById('zoom-in-btn').addEventListener('click', () => {
    mapView.getMap().zoomIn({ duration: 300 });
  });
  document.getElementById('zoom-out-btn').addEventListener('click', () => {
    mapView.getMap().zoomOut({ duration: 300 });
  });
  document.getElementById('compass-btn').addEventListener('click', () => {
    mapView.getMap().resetNorthPitch({ duration: 500 });
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────────
init().catch(console.error);

