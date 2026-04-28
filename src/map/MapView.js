/**
 * MapView.js — MapLibre GL controller
 * Handles map init, offline tiles via PMTiles, styling
 */
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

// Region bounding boxes for initial view
const REGIONS = {
  india:  { center: [78.9629, 20.5937], zoom: 4.5 },
  europe: { center: [15.2551, 54.5260], zoom: 4 },
  usa:    { center: [-95.7129, 37.0902], zoom: 3.5 },
  japan:  { center: [138.2529, 36.2048], zoom: 5 },
  korea:  { center: [127.7669, 35.9078], zoom: 6 },
  russia: { center: [105.3188, 61.5240], zoom: 3 },
  canada: { center: [-106.3468, 56.1304], zoom: 3.5 }
};

export class MapView {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.userMarker = null;
    this.routeLayerAdded = false;
    this.markers = [];
  }

  init(region = 'india') {
    // Register PMTiles protocol for offline tiles
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    const { center, zoom } = REGIONS[region] || REGIONS.india;

    this.map = new maplibregl.Map({
      container: this.containerId,
      style: this._buildMapStyle(),
      center,
      zoom,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: false,
      pitchWithRotate: true,
      dragRotate: true,
    });

    this.map.on('load', () => {
      this._addRouteLayer();
      console.log('[MapView] Map loaded');
    });

    // Touch: two-finger tilt for 3D view
    this.map.touchPitch.enable();

    return this.map;
  }

  _buildMapStyle() {
    // Clean light style - using standard OSM tiles
    return {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        osm: {
          type: 'raster',
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#f8f9fa' }
        },
        {
          id: 'osm-tiles',
          type: 'raster',
          source: 'osm',
          paint: {
            'raster-opacity': 1
          }
        }
      ]
    };
  }

  _addRouteLayer() {
    if (this.routeLayerAdded) return;

    this.map.addSource('route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // Route casing (outline)
    this.map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#1d4ed8',
        'line-width': 10,
        'line-opacity': 0.8
      }
    });

    // Route fill
    this.map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 6,
        'line-opacity': 1
      }
    });

    // Animated dash for active navigation
    this.map.addLayer({
      id: 'route-dash',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#93c5fd',
        'line-width': 3,
        'line-dasharray': [0, 4, 3],
        'line-opacity': 0.9
      }
    });

    this.routeLayerAdded = true;
    this._startRouteAnimation();
  }

  _startRouteAnimation() {
    let step = 0;
    const animate = () => {
      step = (step + 1) % 100;
      if (this.map.getLayer('route-dash')) {
        this.map.setPaintProperty('route-dash', 'line-dasharray', [0, 4, step / 20, 4]);
      }
      requestAnimationFrame(animate);
    };
    animate();
  }

  drawRoute(geojson) {
    if (!this.map || !this.routeLayerAdded) return;
    this.map.getSource('route').setData(geojson);

    // Fit map to route bounds
    if (geojson.features.length > 0) {
      const coords = geojson.features[0].geometry.coordinates;
      const bounds = coords.reduce((b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      this.map.fitBounds(bounds, { padding: { top: 120, bottom: 240, left: 40, right: 40 }, duration: 1000 });
    }
  }

  clearRoute() {
    if (!this.map || !this.routeLayerAdded) return;
    this.map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
  }

  setUserLocation(lng, lat) {
    if (this.userMarker) {
      this.userMarker.setLngLat([lng, lat]);
      return;
    }

    const el = document.createElement('div');
    el.className = 'user-location-marker';
    el.innerHTML = `
      <div class="user-dot-pulse"></div>
      <div class="user-dot"></div>
    `;
    el.style.cssText = `
      position: relative; width: 20px; height: 20px;
    `;
    el.querySelector('.user-dot').style.cssText = `
      position: absolute; inset: 4px;
      background: #3b82f6; border-radius: 50%;
      border: 2px solid #fff;
      box-shadow: 0 0 10px rgba(59,130,246,0.8);
    `;
    el.querySelector('.user-dot-pulse').style.cssText = `
      position: absolute; inset: 0;
      background: rgba(59,130,246,0.3); border-radius: 50%;
      animation: gps-pulse 1.5s infinite;
    `;

    this.userMarker = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(this.map);
  }

  addPinMarker(lng, lat, label = '') {
    const el = document.createElement('div');
    el.style.cssText = `
      width: 36px; height: 44px; cursor: pointer;
    `;
    el.innerHTML = `
      <svg viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill="#ef4444"/>
        <circle cx="18" cy="18" r="8" fill="white"/>
      </svg>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(this.map);

    if (label) {
      marker.setPopup(new maplibregl.Popup({ offset: 40, closeButton: false })
        .setHTML(`<div style="font: 500 14px Inter,sans-serif; color: #202124; background: #fff; padding: 8px 14px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">${label}</div>`)
      );
    }

    this.markers.push(marker);
    return marker;
  }

  clearMarkers() {
    this.markers.forEach(m => m.remove());
    this.markers = [];
  }

  flyTo(lng, lat, zoom = 14) {
    this.map.flyTo({
      center: [lng, lat],
      zoom,
      duration: 2000,
      essential: true,
      curve: 1.42,
      speed: 0.8
    });
  }

  setRegion(region) {
    const { center, zoom } = REGIONS[region] || REGIONS.india;
    this.map.flyTo({
      center,
      zoom,
      duration: 2500,
      essential: true,
      curve: 1.2
    });
  }

  getMap() { return this.map; }
}
