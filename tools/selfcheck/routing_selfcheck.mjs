import { readFile } from 'node:fs/promises';
import { AStarRouter } from '../../src/routing/AStarRouter.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

function withFixedHour(hour, callback) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super('2026-01-15T00:00:00.000Z');
      } else {
        super(...args);
      }
    }
    getHours() {
      return hour;
    }
  }
  globalThis.Date = FixedDate;
  try {
    return callback();
  } finally {
    globalThis.Date = RealDate;
  }
}

async function validateAutomotiveModes() {
  const router = new AStarRouter();
  await router.loadGraph({
    nodes: {
      start: [77.0, 28.0],
      toll: [77.001, 28.0],
      safe: [77.0, 28.001],
      minor: [77.0005, 28.0005],
      end: [77.001, 28.001],
    },
    edges: {
      start: [
        { to: 'toll', dist: 1000, time: 20, type: 'residential', toll: true },
        { to: 'safe', dist: 1500, time: 50, type: 'primary' },
        { to: 'minor', dist: 2000, time: 25, type: 'residential' },
      ],
      toll: [{ to: 'end', dist: 1000, time: 20, type: 'residential', toll: true }],
      safe: [{ to: 'end', dist: 1500, time: 50, type: 'primary' }],
      minor: [{ to: 'end', dist: 2000, time: 25, type: 'residential' }],
      end: [],
    },
  });

  withFixedHour(12, () => {
    assert(
      router.route('start', 'end', 'fastest')?.path.join('>') === 'start>toll>end',
      'fastest route regression',
    );
    assert(
      !router.route('start', 'end', 'no-toll')?.path.includes('toll'),
      'no-toll route used a toll edge',
    );
    assert(
      router.route('start', 'end', 'safest')?.path.join('>') === 'start>safe>end',
      'safest route regression',
    );
  });
}

async function validateGeneratedIndiaGraph() {
  const graph = JSON.parse(await readFile('./public/data/graph/india.json', 'utf8'));
  assert(graph?.nodes && graph?.edges, 'India graph missing nodes or edges');

  const router = new AStarRouter();
  await router.loadGraph(graph);
  const connectedStart = Object.entries(graph.edges).find(([, edges]) => Array.isArray(edges) && edges.length > 0);
  assert(connectedStart, 'India graph has no routable edges');

  const [startId, edges] = connectedStart;
  const endId = edges[0].to;
  const route = router.route(startId, endId, 'fastest');
  assert(route?.path?.length >= 2, 'India graph failed direct connected route');
  assert(route.distance > 0 && route.duration > 0, 'India graph route has invalid metrics');
}

async function run() {
  await validateAutomotiveModes();
  await validateGeneratedIndiaGraph();
}

run()
  .then(() => {
    process.stdout.write('[ok] routing selfcheck: automotive modes and generated graph are routable\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] routing selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
