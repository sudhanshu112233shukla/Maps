import { clamp, lerp } from './geo.js';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class GpsSmoother {
  constructor(options = {}) {
    this.baseAlpha = options.baseAlpha ?? 0.25;
    this.minAlpha = options.minAlpha ?? 0.12;
    this.maxAlpha = options.maxAlpha ?? 0.55;
    this.last = null;
  }

  reset() {
    this.last = null;
  }

  update(sample) {
    if (!sample) return null;
    const ts = Number.isFinite(sample.timestampMs) ? sample.timestampMs : nowMs();

    if (!this.last) {
      this.last = { ...sample, timestampMs: ts };
      return this.last;
    }

    const dt = Math.max(0.05, (ts - this.last.timestampMs) / 1000);
    const speed = Number.isFinite(sample.speedMps) ? sample.speedMps : this.last.speedMps || 0;
    const accuracy = Number.isFinite(sample.accuracyM) ? sample.accuracyM : 20;

    const speedFactor = clamp(speed / 15, 0, 1);
    const accuracyFactor = clamp(1 - accuracy / 50, 0, 1);
    const dynamicAlpha = clamp(
      this.baseAlpha + 0.25 * speedFactor + 0.15 * accuracyFactor,
      this.minAlpha,
      this.maxAlpha,
    );

    const lng = lerp(this.last.lng, sample.lng, dynamicAlpha);
    const lat = lerp(this.last.lat, sample.lat, dynamicAlpha);

    let heading = sample.headingDeg;
    if (Number.isFinite(this.last.headingDeg) && Number.isFinite(sample.headingDeg)) {
      const prev = this.last.headingDeg;
      let delta = heading - prev;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      heading = prev + delta * clamp(dynamicAlpha * (0.6 + 0.4 * speedFactor), 0.1, 0.8);
      while (heading < 0) heading += 360;
      while (heading >= 360) heading -= 360;
    }

    this.last = {
      ...sample,
      lng,
      lat,
      speedMps: speed,
      headingDeg: heading,
      timestampMs: ts,
      dtSeconds: dt,
      alpha: dynamicAlpha,
    };

    return this.last;
  }
}