import { bearingDegrees, wrapAngleDelta } from './geo.js';

function toPoint(coord) {
  return { lng: coord[0], lat: coord[1] };
}

function projectPointToSegmentMeters(p, a, b) {
  const lat0 = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const mx = 111320 * Math.cos(lat0);
  const my = 110540;

  const ax = a.lng * mx;
  const ay = a.lat * my;
  const bx = b.lng * mx;
  const by = b.lat * my;
  const px = p.lng * mx;
  const py = p.lat * my;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const denom = abx * abx + aby * aby;
  const t = denom > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom)) : 0;
  const qx = ax + abx * t;
  const qy = ay + aby * t;

  const dx = px - qx;
  const dy = py - qy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  return {
    t,
    lateralMeters: dist,
    snapped: { lng: qx / mx, lat: qy / my },
  };
}

export class MapMatcher {
  constructor(options = {}) {
    this.windowSize = options.windowSize ?? 40;
    this.maxLateralMeters = options.maxLateralMeters ?? 60;
  }

  match(routeCoords, gpsSample, state = {}) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2 || !gpsSample) return null;

    const p = { lng: gpsSample.lng, lat: gpsSample.lat };
    const lastIndex = Number.isFinite(state.lastIndex) ? state.lastIndex : 0;

    const startSeg = Math.max(0, lastIndex - this.windowSize);
    const endSeg = Math.min(routeCoords.length - 2, lastIndex + this.windowSize);

    let best = null;
    for (let i = startSeg; i <= endSeg; i += 1) {
      const a = toPoint(routeCoords[i]);
      const b = toPoint(routeCoords[i + 1]);
      const proj = projectPointToSegmentMeters(p, a, b);

      if (!best || proj.lateralMeters < best.lateralMeters) {
        best = { segIndex: i, ...proj, a, b };
      }
    }

    if (!best) return null;

    const speed = gpsSample.speedMps ?? 0;
    const heading = gpsSample.headingDeg;
    let headingPenalty = 0;
    if (speed > 2 && Number.isFinite(heading)) {
      const segBearing = bearingDegrees(best.a, best.b);
      const delta = Math.abs(wrapAngleDelta(segBearing - heading));
      headingPenalty = delta > 90 ? (delta - 90) * 0.7 : 0;
    }

    const score = best.lateralMeters + headingPenalty;
    const within = best.lateralMeters <= this.maxLateralMeters;

    return {
      segIndex: best.segIndex,
      t: best.t,
      snapped: best.snapped,
      lateralMeters: best.lateralMeters,
      score,
      withinLateral: within,
    };
  }
}