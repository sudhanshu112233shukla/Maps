import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { getRegionViewport } from '../offline/offlineRegions.js';

const DEFAULT_SOURCE = {
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  attribution: '© OpenStreetMap contributors',
};

let protocolRegistered = false;

export class MapView {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.userMarker = null;
    this.routeLayerAdded = false;
    this.markers = [];
    this.baseSourceConfig = DEFAULT_SOURCE;
  }

  init(region = 'india', sourceConfig = DEFAULT_SOURCE) {
    if (!protocolRegistered) {
      const protocol = new Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);
      protocolRegistered = true;
    }

    this.baseSourceConfig = sourceConfig || DEFAULT_SOURCE;

    const { center, zoom } = getRegionViewport(region);

    this.map = new maplibregl.Map({
      container: this.containerId,
      style: this.#buildMapStyle(this.baseSourceConfig),
      center,
      zoom,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: false,
      pitchWithRotate: true,
      dragRotate: true,
    });

    this.map.on('load', () => {
      this.#addRouteLayer();
    });

    this.map.touchPitch?.enable();
    return this.map;
  }

  drawRoute(geojson) {
    if (!this.map || !this.routeLayerAdded) return;
    this.map.getSource('route')?.setData(geojson);

    if (geojson.features.length > 0) {
      const coordinates = geojson.features[0].geometry.coordinates;
      const bounds = coordinates.reduce(
        (accumulator, coordinate) => accumulator.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
      );

      this.map.fitBounds(bounds, {
        padding: { top: 120, bottom: 240, left: 40, right: 40 },
        duration: 900,
      });
    }
  }

  clearRoute() {
    if (!this.map || !this.routeLayerAdded) return;
    this.map.getSource('route')?.setData({
      type: 'FeatureCollection',
      features: [],
    });
  }

  setUserLocation(lng, lat) {
    if (this.userMarker) {
      this.userMarker.setLngLat([lng, lat]);
      return;
    }

    const markerElement = document.createElement('div');
    markerElement.className = 'user-location-marker';
    markerElement.innerHTML = `
      <div class="user-dot-pulse"></div>
      <div class="user-dot"></div>
    `;
    markerElement.style.cssText = 'position: relative; width: 20px; height: 20px;';

    markerElement.querySelector('.user-dot').style.cssText = `
      position: absolute;
      inset: 4px;
      background: #2563eb;
      border-radius: 50%;
      border: 2px solid #ffffff;
      box-shadow: 0 0 10px rgba(37, 99, 235, 0.8);
    `;

    markerElement.querySelector('.user-dot-pulse').style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(37, 99, 235, 0.28);
      border-radius: 50%;
      animation: gps-pulse 1.5s infinite;
    `;

    this.userMarker = new maplibregl.Marker({ element: markerElement })
      .setLngLat([lng, lat])
      .addTo(this.map);
  }

  addPinMarker(lng, lat, label = '') {
    const markerElement = document.createElement('div');
    markerElement.style.cssText = 'width: 36px; height: 44px; cursor: pointer;';
    markerElement.innerHTML = `
      <svg viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill="#ef4444"/>
        <circle cx="18" cy="18" r="8" fill="white"/>
      </svg>
    `;

    const marker = new maplibregl.Marker({ element: markerElement })
      .setLngLat([lng, lat])
      .addTo(this.map);

    if (label) {
      marker.setPopup(
        new maplibregl.Popup({ offset: 40, closeButton: false }).setHTML(
          `<div style="font: 500 14px system-ui, sans-serif; color: #202124; background: #fff; padding: 8px 14px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">${label}</div>`,
        ),
      );
    }

    this.markers.push(marker);
    return marker;
  }

  clearMarkers() {
    this.markers.forEach((marker) => marker.remove());
    this.markers = [];
  }

  flyTo(lng, lat, zoom = 14) {
    this.map?.flyTo({
      center: [lng, lat],
      zoom,
      duration: 1200,
      essential: true,
      curve: 1.25,
      speed: 0.9,
    });
  }

  setRegion(region) {
    const { center, zoom } = getRegionViewport(region);
    this.map?.flyTo({
      center,
      zoom,
      duration: 1800,
      essential: true,
      curve: 1.2,
    });
  }

  getMap() {
    return this.map;
  }

  updateSourceConfig(sourceConfig = DEFAULT_SOURCE) {
    this.baseSourceConfig = sourceConfig;
  }

  #buildMapStyle(sourceConfig) {
    return {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: sourceConfig.tiles || DEFAULT_SOURCE.tiles,
          tileSize: 256,
          attribution: sourceConfig.attribution || DEFAULT_SOURCE.attribution,
        },
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#edf2f7' },
        },
        {
          id: 'basemap-layer',
          type: 'raster',
          source: 'basemap',
          paint: { 'raster-opacity': 1 },
        },
      ],
    };
  }

  #addRouteLayer() {
    if (this.routeLayerAdded) return;

    this.map.addSource('route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#1d4ed8',
        'line-width': 10,
        'line-opacity': 0.8,
      },
    });

    this.map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#60a5fa',
        'line-width': 6,
        'line-opacity': 1,
      },
    });

    this.map.addLayer({
      id: 'route-dash',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#bfdbfe',
        'line-width': 3,
        'line-dasharray': [0, 4, 3],
        'line-opacity': 0.9,
      },
    });

    this.routeLayerAdded = true;
    this.#animateRoute();
  }

  #animateRoute() {
    let step = 0;
    const frame = () => {
      step = (step + 1) % 100;
      if (this.map?.getLayer('route-dash')) {
        this.map.setPaintProperty('route-dash', 'line-dasharray', [0, 4, step / 20, 4]);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
