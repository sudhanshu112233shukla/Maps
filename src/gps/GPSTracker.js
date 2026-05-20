/**
 * GPSTracker.js â€” On-device GPS using Capacitor Geolocation
 * Falls back to browser geolocation API for web testing
 */

export class GPSTracker {
  constructor() {
    this.watchId = null;
    this.position = null;
    this.listeners = [];
    this.isCapacitor = typeof window !== 'undefined' && !!window.Capacitor;
  }

  async requestPermission() {
    if (this.isCapacitor) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const perm = await Geolocation.requestPermissions();
        return perm.location === 'granted';
      } catch (e) {
        console.warn('[GPS] Capacitor not available, using browser fallback');
      }
    }
    return 'geolocation' in navigator;
  }

  async getCurrentPosition() {
    if (this.isCapacitor) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        return { lng: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy };
      } catch (e) { /* fall through */ }
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy }),
        reject,
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  startWatching(callback) {
    this.listeners.push(callback);
    if (this.watchId) return;

    const handlePos = (pos) => {
      this.position = {        lng: pos.coords.longitude,        lat: pos.coords.latitude,        speed: pos.coords.speed,        heading: pos.coords.heading,        accuracy: pos.coords.accuracy,        timestampMs: pos.timestamp || Date.now(),      };
      this.listeners.forEach(cb => cb(this.position));
    };

    if (this.isCapacitor) {
      import('@capacitor/geolocation').then(({ Geolocation }) => {
        Geolocation.watchPosition({ enableHighAccuracy: true }, handlePos)
          .then(id => { this.watchId = id; });
      });
    } else {
      this.watchId = navigator.geolocation.watchPosition(handlePos, console.error, {
        enableHighAccuracy: true, maximumAge: 1000, timeout: 5000
      });
    }
  }

  stopWatching() {
    if (!this.watchId) return;
    if (this.isCapacitor) {
      import('@capacitor/geolocation').then(({ Geolocation }) => Geolocation.clearWatch({ id: this.watchId }));
    } else {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.listeners = [];
  }

  getPosition() { return this.position; }
}
