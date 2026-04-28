/**
 * AStarRouter.js — On-device A* routing engine
 * Works entirely offline using pre-built OSM road graph
 */

// Road type speed limits (km/h)
const ROAD_SPEEDS = {
  motorway: 120, motorway_link: 80,
  trunk: 100,    trunk_link: 70,
  primary: 80,   primary_link: 60,
  secondary: 60, secondary_link: 50,
  tertiary: 50,  tertiary_link: 40,
  residential: 30, living_street: 15,
  service: 20, unclassified: 40,
  default: 40
};

// Toll penalties by mode
const TOLL_PENALTY = { fastest: 0, eco: 0, 'no-toll': 1e9 };

/**
 * Haversine distance between two [lng, lat] points in meters
 */
function haversine([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Priority Queue (min-heap) for A*
 */
class PriorityQueue {
  constructor() { this.heap = []; }

  push(item, priority) {
    this.heap.push({ item, priority });
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() { return this.heap.length; }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent].priority <= this.heap[i].priority) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let min = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.heap[l].priority < this.heap[min].priority) min = l;
      if (r < n && this.heap[r].priority < this.heap[min].priority) min = r;
      if (min === i) break;
      [this.heap[min], this.heap[i]] = [this.heap[i], this.heap[min]];
      i = min;
    }
  }
}

export class AStarRouter {
  constructor() {
    this.graph = null;   // adjacency list: nodeId → [{nodeId, distance, time, roadType, isToll}]
    this.nodes = null;   // nodeId → [lng, lat]
    this.kdTree = null;  // spatial index
    this.loaded = false;
  }

  /**
   * Load road graph from IndexedDB or a pre-built JSON blob
   * graph: { nodes: {id: [lng,lat]}, edges: {id: [{to,dist,time,type,toll}]} }
   */
  async loadGraph(graphData) {
    this.nodes = graphData.nodes;
    this.graph = graphData.edges;
    this._buildKDTree();
    this.loaded = true;
    console.log(`[Router] Graph loaded: ${Object.keys(this.nodes).length} nodes`);
  }

  /**
   * Simple KD-tree approximation using sorted arrays
   * For production, swap with a proper KD-tree library
   */
  _buildKDTree() {
    this.nodeList = Object.entries(this.nodes).map(([id, coord]) => ({ id, coord }));
    // Sort by longitude for fast lookup
    this.nodeListSortedLng = [...this.nodeList].sort((a, b) => a.coord[0] - b.coord[0]);
  }

  /**
   * Snap a [lng, lat] point to the nearest graph node
   */
  snapToNode(lng, lat) {
    if (!this.nodeList) return null;
    let best = null, bestDist = Infinity;
    for (const node of this.nodeList) {
      const d = haversine([lng, lat], node.coord);
      if (d < bestDist) { bestDist = d; best = node.id; }
    }
    return best;
  }

  /**
   * A* routing between two node IDs
   * @param {string} startId - start node ID
   * @param {string} endId   - end node ID
   * @param {string} mode    - 'fastest' | 'eco' | 'no-toll'
   * @returns {{ path: string[], distance: number, duration: number } | null}
   */
  route(startId, endId, mode = 'fastest') {
    if (!this.loaded) throw new Error('Graph not loaded');

    const endCoord = this.nodes[endId];
    const tollPenalty = TOLL_PENALTY[mode] ?? 0;

    const g = new Map();       // cost so far
    const came = new Map();    // path tracking
    const open = new PriorityQueue();

    g.set(startId, 0);
    open.push(startId, 0);

    while (open.size > 0) {
      const { item: current } = open.pop();

      if (current === endId) {
        return this._reconstructPath(came, startId, endId);
      }

      const neighbors = this.graph[current] || [];
      for (const edge of neighbors) {
        const toll = edge.toll ? tollPenalty : 0;
        
        // Safety factor: penalize non-primary/motorway roads in 'safest' mode
        let safetyPenalty = 0;
        if (mode === 'safest') {
          const isSafe = ['motorway', 'trunk', 'primary'].includes(edge.type);
          if (!isSafe) safetyPenalty = edge.dist * 2; // Double the "cost" of minor roads
        }

        const edgeCost = mode === 'eco'
          ? edge.dist                          // minimize distance for eco
          : edge.time + toll + safetyPenalty;  // minimize time + safety for others

        const newCost = (g.get(current) || 0) + edgeCost;

        if (!g.has(edge.to) || newCost < g.get(edge.to)) {
          g.set(edge.to, newCost);
          came.set(edge.to, current);
          // Heuristic: haversine time to goal
          const heuristic = haversine(this.nodes[edge.to], endCoord) / (120000 / 3600);
          open.push(edge.to, newCost + heuristic);
        }
      }
    }

    return null; // No path found
  }

  _reconstructPath(came, startId, endId) {
    const path = [];
    let current = endId;
    while (current !== startId) {
      path.unshift(current);
      current = came.get(current);
      if (!current) return null;
    }
    path.unshift(startId);

    // Build GeoJSON + calculate stats
    let totalDist = 0, totalTime = 0;
    const coords = path.map(id => this.nodes[id]);

    for (let i = 1; i < path.length; i++) {
      const edges = this.graph[path[i - 1]] || [];
      const edge = edges.find(e => e.to === path[i]);
      if (edge) { totalDist += edge.dist; totalTime += edge.time; }
    }

    return {
      path,
      coords,
      distance: Math.round(totalDist),      // meters
      duration: Math.round(totalTime),       // seconds
      geojson: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { distance: totalDist, duration: totalTime }
        }]
      }
    };
  }

  /**
   * Full route: lat/lng → lat/lng (snaps to graph internally)
   */
  async routeLatLng(startLng, startLat, endLng, endLat, mode = 'fastest') {
    const startId = this.snapToNode(startLng, startLat);
    const endId = this.snapToNode(endLng, endLat);
    if (!startId || !endId) return null;
    return this.route(startId, endId, mode);
  }

  /**
   * Generate turn-by-turn instructions from path
   */
  generateInstructions(path, coords) {
    const instructions = [];
    if (!coords || coords.length < 2) return instructions;

    instructions.push({ text: 'Start on route', dist: 0, icon: 'start' });

    for (let i = 1; i < coords.length - 1; i += Math.ceil(coords.length / 8)) {
      const dx = coords[i + 1][0] - coords[i][0];
      const dy = coords[i + 1][1] - coords[i][1];
      const prevDx = coords[i][0] - coords[i - 1][0];
      const prevDy = coords[i][1] - coords[i - 1][1];
      const cross = prevDx * dy - prevDy * dx;
      const dist = Math.round(haversine(coords[i - 1], coords[i]));

      let text = 'Continue straight';
      let icon = 'straight';
      if (cross > 0.0001) { text = 'Turn right'; icon = 'right'; }
      else if (cross < -0.0001) { text = 'Turn left'; icon = 'left'; }

      instructions.push({ text, dist, icon });
    }

    instructions.push({ text: 'Arrive at destination', dist: 0, icon: 'arrive' });
    return instructions;
  }
}
