import { wrapAngleDelta } from './geo.js';

export class OffRouteDetector {
  constructor(options = {}) {
    this.lateralThresholdM = options.lateralThresholdM ?? 30;
    this.persistSeconds = options.persistSeconds ?? 6;
    this.headingThresholdDeg = options.headingThresholdDeg ?? 45;
    this.cooldownSeconds = options.cooldownSeconds ?? 15;

    this.offSinceMs = null;
    this.lastRerouteMs = 0;
  }

  reset() {
    this.offSinceMs = null;
    this.lastRerouteMs = 0;
  }

  update({ nowMs, lateralMeters, routeBearingDeg, headingDeg, speedMps }) {
    const speed = Number.isFinite(speedMps) ? speedMps : 0;
    const headingOk = Number.isFinite(headingDeg) && Number.isFinite(routeBearingDeg);
    const headingDelta = headingOk ? Math.abs(wrapAngleDelta(routeBearingDeg - headingDeg)) : 0;

    const lateralBad = Number.isFinite(lateralMeters) && lateralMeters > this.lateralThresholdM;
    const headingBad = headingOk && speed > 3 ? headingDelta > this.headingThresholdDeg : lateralBad;

    const off = lateralBad && headingBad;
    if (!off) {
      this.offSinceMs = null;
      return { offRoute: false, shouldReroute: false, headingDeltaDeg: headingDelta };
    }

    if (!this.offSinceMs) this.offSinceMs = nowMs;
    const offFor = (nowMs - this.offSinceMs) / 1000;

    const cooldownOk = (nowMs - this.lastRerouteMs) / 1000 >= this.cooldownSeconds;
    const shouldReroute = offFor >= this.persistSeconds && cooldownOk;

    if (shouldReroute) this.lastRerouteMs = nowMs;

    return { offRoute: true, shouldReroute, offForSeconds: offFor, headingDeltaDeg: headingDelta };
  }
}