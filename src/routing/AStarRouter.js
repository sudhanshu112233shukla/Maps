const ROAD_SPEEDS = {
  motorway: 120,
  motorway_link: 80,
  trunk: 100,
  trunk_link: 70,
  primary: 80,
  primary_link: 60,
  secondary: 60,
  secondary_link: 50,
  tertiary: 50,
  tertiary_link: 40,
  residential: 30,
  living_street: 15,
  service: 20,
  unclassified: 40,
  default: 40,
};

const MINOR_ROADS = new Set(['residential', 'living_street', 'service', 'tertiary']);
const MAJOR_ROADS = new Set(['motorway', 'trunk', 'primary']);
// Snap radius is intentionally conservative to avoid "teleporting" to a far-away
// graph node which creates misleading straight-line routes when the active
// region pack is missing or the destination is outside the loaded graph.
const MAX_SNAP_DISTANCE_METERS = 8000;
const HEURISTIC_SPEED_METERS_PER_SECOND = (130 * 1000) / 3600;

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

function speedForRoadType(roadType) {
  return ROAD_SPEEDS[roadType] || ROAD_SPEEDS.default;
}

function estimateTravelTimeSeconds(distanceMeters, roadType) {
  const speedMetersPerSecond = (speedForRoadType(roadType) * 1000) / 3600;
  return distanceMeters / speedMetersPerSecond;
}

function bearing(from, to) {
  const [lng1, lat1] = from.map((value) => (value * Math.PI) / 180);
  const [lng2, lat2] = to.map((value) => (value * Math.PI) / 180);
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function normalizeTurn(delta) {
  let angle = delta;
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  push(item, priority) {
    this.heap.push({ item, priority });
    this.#bubbleUp(this.heap.length - 1);
  }

  pop() {
    const top = this.heap[0];
    const tail = this.heap.pop();
    if (this.heap.length > 0 && tail) {
      this.heap[0] = tail;
      this.#sinkDown(0);
    }
    return top;
  }

  get size() {
    return this.heap.length;
  }

  #bubbleUp(index) {
    let currentIndex = index;
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[currentIndex].priority) break;
      [this.heap[parentIndex], this.heap[currentIndex]] = [
        this.heap[currentIndex],
        this.heap[parentIndex],
      ];
      currentIndex = parentIndex;
    }
  }

  #sinkDown(index) {
    let currentIndex = index;
    while (true) {
      const left = currentIndex * 2 + 1;
      const right = currentIndex * 2 + 2;
      let smallest = currentIndex;

      if (left < this.heap.length && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }

      if (right < this.heap.length && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }

      if (smallest === currentIndex) break;

      [this.heap[currentIndex], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[currentIndex],
      ];
      currentIndex = smallest;
    }
  }
}

export class AStarRouter {
  constructor(options = {}) {
    this.vehicleProfile = options.vehicleProfile || 'automobile';
    this.graph = null;
    this.nodes = null;
    this.nodeList = [];
    this.loaded = false;

    this.gridSizeDegrees = options.gridSizeDegrees || 0.02;
    this.spatialIndex = new Map();
  }

  async loadGraph(graphData) {
    this.nodes = graphData.nodes;
    this.graph = graphData.edges;
    this.nodeList = Object.entries(this.nodes).map(([id, coord]) => ({ id, coord }));
    this.#buildSpatialIndex();
    this.loaded = true;
  }

  snapToNode(lng, lat, maxDistanceMeters = MAX_SNAP_DISTANCE_METERS, options = {}) {
    if (!this.nodeList.length) return null;

    const excludeId = options.excludeId || null;
    const candidates = this.#gatherCandidateNodes(lng, lat, maxDistanceMeters);
    let closestNodeId = null;
    let closestDistance = Infinity;

    if (candidates.length) {
      for (const node of candidates) {
        if (excludeId && node.id === excludeId) continue;
        const distance = haversine([lng, lat], node.coord);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestNodeId = node.id;
        }
      }
    }

    if (closestNodeId && closestDistance <= maxDistanceMeters) return closestNodeId;

    return null;
  }

  route(startId, endId, mode = 'fastest') {
    if (!this.loaded) throw new Error('Graph not loaded');

    const openSet = new PriorityQueue();
    const gScore = new Map([[startId, 0]]);
    const parent = new Map();
    const closed = new Set();
    const targetCoord = this.nodes[endId];
    const maxVisitedNodes = Math.max(this.nodeList.length * 5, 200000);
    let visitedCount = 0;

    openSet.push(startId, 0);

    while (openSet.size > 0) {
      const current = openSet.pop()?.item;
      if (!current || closed.has(current)) continue;

      visitedCount += 1;
      if (visitedCount > maxVisitedNodes) {
        return null;
      }

      if (current === endId) {
        return this.#buildRoute(parent, startId, endId);
      }

      closed.add(current);

      const edges = this.graph[current] || [];
      for (const edge of edges) {
        if (closed.has(edge.to)) continue;

        const edgeCost = this.#scoreEdge(edge, mode);
        const tentative = (gScore.get(current) || 0) + edgeCost;

        if (!gScore.has(edge.to) || tentative < gScore.get(edge.to)) {
          gScore.set(edge.to, tentative);
          parent.set(edge.to, current);
          const heuristic = this.#heuristicTime(this.nodes[edge.to], targetCoord);
          openSet.push(edge.to, tentative + heuristic);
        }
      }
    }

    return null;
  }

  async routeLatLng(startLng, startLat, endLng, endLat, mode = 'fastest') {
    let startId = this.snapToNode(startLng, startLat);
    let endId = this.snapToNode(endLng, endLat);
    if (!startId || !endId) return null;
    
    if (startId === endId) {
      const endAlt = this.snapToNode(endLng, endLat, MAX_SNAP_DISTANCE_METERS, { excludeId: startId });
      if (endAlt && endAlt !== startId) {
        endId = endAlt;
      } else {
        const startAlt = this.snapToNode(startLng, startLat, MAX_SNAP_DISTANCE_METERS, { excludeId: endId });
        if (startAlt && startAlt !== endId) {
          startId = startAlt;
        }
      }

      if (startId === endId) {
        return null;
      }
    }
    
    return this.route(startId, endId, mode);
  }

  generateInstructions(path, coords) {
    if (!coords || coords.length < 2) return [];

    const instructions = [{ text: 'Start on the highlighted route', dist: 0, icon: 'start' }];
    let distanceSinceLastTurn = 0;
    let previousBearing = bearing(coords[0], coords[1]);

    for (let index = 1; index < coords.length - 1; index += 1) {
      distanceSinceLastTurn += haversine(coords[index - 1], coords[index]);
      const nextBearing = bearing(coords[index], coords[index + 1]);
      const turn = normalizeTurn(nextBearing - previousBearing);

      if (Math.abs(turn) < 25) {
        previousBearing = nextBearing;
        continue;
      }

      instructions.push({
        text: this.#turnText(turn),
        dist: Math.round(distanceSinceLastTurn),
        icon: turn > 0 ? 'right' : 'left',
      });

      distanceSinceLastTurn = 0;
      previousBearing = nextBearing;
    }

    instructions.push({ text: 'Arrive at destination', dist: 0, icon: 'arrive' });
    return instructions;
  }

  #heuristicTime(from, to) {
    return haversine(from, to) / HEURISTIC_SPEED_METERS_PER_SECOND;
  }

  #scoreEdge(edge, mode) {
    const baseTime = Number.isFinite(edge.time)
      ? edge.time
      : estimateTravelTimeSeconds(edge.dist, edge.type);
    const currentHour = new Date().getHours();
    const isPeakTraffic = (currentHour >= 8 && currentHour <= 10) || (currentHour >= 17 && currentHour <= 20);
    const isNight = currentHour >= 21 || currentHour <= 5;
    const trafficMultiplier =
      isPeakTraffic && (edge.type === 'motorway' || edge.type === 'primary') ? 1.35 : 1;

    let score = baseTime * trafficMultiplier;

    if (mode === 'no-toll' && edge.toll) {
      score += 1e7;
    }

    if (mode === 'eco') {
      score += edge.dist * 0.0015;
      score += Math.abs(speedForRoadType(edge.type) - 65) * 0.04 * edge.dist;
    }

    if (mode === 'safest') {
      if (MINOR_ROADS.has(edge.type)) score += edge.dist * 0.03;
      if (isNight && !MAJOR_ROADS.has(edge.type)) score += edge.dist * 0.05;
    }

    if (this.vehicleProfile === 'automobile' && edge.type === 'living_street') {
      score += 300;
    }

    return score;
  }

  #buildSpatialIndex() {
    this.spatialIndex.clear();
    this.nodeList.forEach((node) => {
      const key = this.#cellKey(node.coord[0], node.coord[1]);
      if (!this.spatialIndex.has(key)) {
        this.spatialIndex.set(key, []);
      }
      this.spatialIndex.get(key).push(node);
    });
  }

  #gatherCandidateNodes(lng, lat, maxDistanceMeters) {
    if (!this.spatialIndex.size) return this.nodeList;

    const candidates = [];
    const [baseX, baseY] = this.#cellCoordinates(lng, lat);
    const cellsPerDirection = Math.max(
      1,
      Math.ceil(maxDistanceMeters / (this.gridSizeDegrees * 111320)),
    );

    for (let dx = -cellsPerDirection; dx <= cellsPerDirection; dx += 1) {
      for (let dy = -cellsPerDirection; dy <= cellsPerDirection; dy += 1) {
        const cellKey = `${baseX + dx}:${baseY + dy}`;
        const bucket = this.spatialIndex.get(cellKey);
        if (bucket?.length) {
          candidates.push(...bucket);
        }
      }
    }

    return candidates.length ? candidates : this.nodeList;
  }

  #cellKey(lng, lat) {
    const [x, y] = this.#cellCoordinates(lng, lat);
    return `${x}:${y}`;
  }

  #cellCoordinates(lng, lat) {
    return [
      Math.floor((lng + 180) / this.gridSizeDegrees),
      Math.floor((lat + 90) / this.gridSizeDegrees),
    ];
  }

  #buildRoute(parent, startId, endId) {
    const path = [];
    let cursor = endId;

    while (cursor !== startId) {
      path.unshift(cursor);
      cursor = parent.get(cursor);
      if (!cursor) return null;
    }

    path.unshift(startId);

    const coords = path.map((nodeId) => this.nodes[nodeId]);
    let distance = 0;
    let duration = 0;

    for (let index = 1; index < path.length; index += 1) {
      const previousNode = path[index - 1];
      const currentNode = path[index];
      const edge = (this.graph[previousNode] || []).find((candidate) => candidate.to === currentNode);
      if (!edge) continue;

      distance += edge.dist;
      duration += Number.isFinite(edge.time)
        ? edge.time
        : estimateTravelTimeSeconds(edge.dist, edge.type);
    }

    return {
      path,
      coords,
      distance: Math.round(distance),
      duration: Math.round(duration),
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
            properties: { distance, duration },
          },
        ],
      },
    };
  }

  #turnText(turnAngle) {
    const absolute = Math.abs(turnAngle);
    if (absolute >= 140) return turnAngle > 0 ? 'Make a sharp right' : 'Make a sharp left';
    if (absolute >= 60) return turnAngle > 0 ? 'Turn right' : 'Turn left';
    return turnAngle > 0 ? 'Bear right' : 'Bear left';
  }
}
