import { haversineMeters, bearingDegrees } from './geo.js';
import { GpsSmoother } from './GpsSmoother.js';
import { MapMatcher } from './MapMatcher.js';
import { OffRouteDetector } from './OffRouteDetector.js';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function cumulativeDistances(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i += 1) {
    const prev = { lng: coords[i - 1][0], lat: coords[i - 1][1] };
    const cur = { lng: coords[i][0], lat: coords[i][1] };
    cum[i] = cum[i - 1] + haversineMeters(prev, cur);
  }
  return cum;
}

export class NavigationSession {
  constructor(options = {}) {
    this.smoother = new GpsSmoother(options.gpsSmoother);
    this.matcher = new MapMatcher(options.mapMatcher);
    this.offRoute = new OffRouteDetector(options.offRoute);

    this.state = 'IDLE';
    this.route = null;
    this.routeCum = null;
    this.instructions = [];
    this.lastMatch = null;
    this.progressMeters = 0;
    this.lastUpdateMs = 0;
  }

  reset() {
    this.smoother.reset();
    this.offRoute.reset();
    this.state = 'IDLE';
    this.route = null;
    this.routeCum = null;
    this.instructions = [];
    this.lastMatch = null;
    this.progressMeters = 0;
    this.lastUpdateMs = 0;
  }

  setRoute(routeCoords, instructions = []) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2) {
      this.reset();
      return;
    }

    this.route = routeCoords;
    this.routeCum = cumulativeDistances(routeCoords);
    this.instructions = Array.isArray(instructions) ? instructions : [];
    this.lastMatch = {
      segIndex: 0,
      t: 0,
      snapped: { lng: routeCoords[0][0], lat: routeCoords[0][1] },
      lateralMeters: 0,
    };
    this.progressMeters = 0;
    this.state = 'ROUTE_ACTIVE';
  }

  get active() {
    return this.state !== 'IDLE' && Boolean(this.route);
  }

  updateFromGps(rawSample) {
    if (!this.route || !rawSample) return null;

    const ts = Number.isFinite(rawSample.timestampMs) ? rawSample.timestampMs : nowMs();
    const sample = this.smoother.update({ ...rawSample, timestampMs: ts });
    if (!sample) return null;

    const match = this.matcher.match(this.route, sample, {
      lastIndex: this.lastMatch?.segIndex ?? 0,
    });

    if (!match) {
      this.lastUpdateMs = ts;
      return { state: this.state, gps: sample, matched: null, offRoute: true, shouldReroute: false };
    }

    const a = { lng: this.route[match.segIndex][0], lat: this.route[match.segIndex][1] };
    const b = { lng: this.route[match.segIndex + 1][0], lat: this.route[match.segIndex + 1][1] };
    const routeBearingDeg = bearingDegrees(a, b);

    const off = this.offRoute.update({
      nowMs: ts,
      lateralMeters: match.lateralMeters,
      routeBearingDeg,
      headingDeg: sample.headingDeg,
      speedMps: sample.speedMps,
    });

    const segBase = this.routeCum[match.segIndex] || 0;
    const segLen = (this.routeCum[match.segIndex + 1] || segBase) - segBase;
    const candidateProgress = segBase + segLen * match.t;
    this.progressMeters = Math.max(this.progressMeters, candidateProgress);

    const end = this.route[this.route.length - 1];
    const distToEnd = haversineMeters(
      { lng: match.snapped.lng, lat: match.snapped.lat },
      { lng: end[0], lat: end[1] },
    );

    const routeTotal = this.routeCum[this.routeCum.length - 1] || 1;
    const progressRatio = this.progressMeters / routeTotal;

    if (distToEnd < 25 && progressRatio > 0.97) {
      this.state = 'ARRIVED';
    } else if (off.shouldReroute) {
      this.state = 'REROUTING';
    } else {
      this.state = 'ROUTE_ACTIVE';
    }

    this.lastMatch = match;
    this.lastUpdateMs = ts;

    return {
      state: this.state,
      gps: sample,
      matched: {
        lng: match.snapped.lng,
        lat: match.snapped.lat,
        lateralMeters: match.lateralMeters,
        progressMeters: this.progressMeters,
        routeBearingDeg,
      },
      offRoute: off.offRoute,
      shouldReroute: off.shouldReroute,
      distanceRemainingMeters: Math.max(0, routeTotal - this.progressMeters),
      distanceToEndMeters: distToEnd,
    };
  }

  currentInstruction() {
    if (!this.instructions.length) return null;
    // Stable baseline: use accumulated step distances vs progress.
    let accumulator = 0;
    for (const step of this.instructions) {
      const dist = Number.isFinite(step.dist) ? step.dist : 0;
      accumulator += dist;
      if (accumulator >= this.progressMeters) return step;
    }
    return this.instructions[this.instructions.length - 1];
  }
}