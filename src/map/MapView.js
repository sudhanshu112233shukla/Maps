import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { getRegionViewport } from '../offline/offlineRegions.js';

const DEFAULT_SOURCE = {
  type: 'raster',
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  attribution: 'OpenStreetMap contributors',
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
    this.routeAnimationFrame = null;
    this.lastRouteGeoJson = { type: 'FeatureCollection', features: [] };
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
    this.lastRouteGeoJson = geojson;
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
    this.lastRouteGeoJson = { type: 'FeatureCollection', features: [] };
    this.map.getSource('route')?.setData(this.lastRouteGeoJson);
  }

  setUserLocation(lng, lat, heading = null) {
    if (this.userMarker) {
      this.userMarker.setLngLat([lng, lat]);
      this.#updateUserHeading(heading);
      return;
    }

    const markerElement = document.createElement('div');
    markerElement.className = 'user-location-marker';
    markerElement.innerHTML = `
      <div class="user-arrow-pulse"></div>
      <div class="user-arrow">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <path d="M22 3 36 39 22 31 8 39 22 3Z" fill="#1d4ed8" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>
          <circle cx="22" cy="24" r="4" fill="#ffffff"/>
        </svg>
      </div>
    `;
    markerElement.style.cssText = 'position: relative; width: 44px; height: 44px; transform-origin: center;';

    markerElement.querySelector('.user-arrow').style.cssText = `
      position: absolute;
      inset: 0;
      filter: drop-shadow(0 4px 10px rgba(37, 99, 235, 0.45));
      transform-origin: center;
      transition: transform 180ms linear;
    `;

    markerElement.querySelector('.user-arrow-pulse').style.cssText = `
      position: absolute;
      inset: 8px;
      background: rgba(37, 99, 235, 0.22);
      border-radius: 50%;
      animation: gps-pulse 1.5s infinite;
    `;

    this.userMarker = new maplibregl.Marker({ element: markerElement, rotationAlignment: 'map' })
      .setLngLat([lng, lat])
      .addTo(this.map);
    this.#updateUserHeading(heading);
  }


  #updateUserHeading(heading = null) {
    const marker = this.userMarker?.getElement?.();
    const arrow = marker?.querySelector?.('.user-arrow');
    if (!arrow || !Number.isFinite(Number(heading))) return;
    arrow.style.transform = `rotate(${Number(heading)}deg)`;
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
    if (!this.map) return;

    this.routeLayerAdded = false;
    this.map.setStyle(this.#buildMapStyle(this.baseSourceConfig), { diff: false });
    this.map.once('style.load', () => {
      this.#addRouteLayer();
      this.map.getSource('route')?.setData(this.lastRouteGeoJson);
    });
  }

  destroy() {
    if (this.routeAnimationFrame) {
      cancelAnimationFrame(this.routeAnimationFrame);
      this.routeAnimationFrame = null;
    }
    this.map?.remove();
    this.map = null;
  }

  #buildMapStyle(sourceConfig) {
    const sourceType = sourceConfig.type || 'raster';
    const baseSource = {
      type: sourceType,
      attribution: sourceConfig.attribution || DEFAULT_SOURCE.attribution,
    };

    if (sourceConfig.url) {
      baseSource.url = sourceConfig.url;
    } else {
      baseSource.tiles = sourceConfig.tiles || DEFAULT_SOURCE.tiles;
      if (sourceType === 'raster') {
        baseSource.tileSize = sourceConfig.tileSize || 256;
      }
    }

    const baseLayers = [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#edf2f7' },
      },
    ];

    if (sourceType === 'raster') {
      baseLayers.push({
        id: 'basemap-layer',
        type: 'raster',
        source: 'basemap',
        paint: { 'raster-opacity': 1 },
      });
    } else if (Array.isArray(sourceConfig.layers) && sourceConfig.layers.length > 0) {
      baseLayers.push(...sourceConfig.layers);
    }

    const style = {
      version: 8,
      sources: {
        basemap: baseSource,
      },
      layers: baseLayers,
    };

    if (sourceConfig.glyphs) {
      style.glyphs = sourceConfig.glyphs;
    }
    if (sourceConfig.sprite) {
      style.sprite = sourceConfig.sprite;
    }

    return style;
  }

  #addRouteLayer() {
    if (!this.map || this.routeLayerAdded) return;

    this.map.addSource('route', {
      type: 'geojson',
      data: this.lastRouteGeoJson,
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
    if (this.routeAnimationFrame) {
      cancelAnimationFrame(this.routeAnimationFrame);
    }

    let step = 0;
    const frame = () => {
      step = (step + 1) % 100;
      if (this.map?.getLayer('route-dash')) {
        this.map.setPaintProperty('route-dash', 'line-dasharray', [0, 4, step / 20, 4]);
      }
      this.routeAnimationFrame = requestAnimationFrame(frame);
    };
    this.routeAnimationFrame = requestAnimationFrame(frame);
  }
}
