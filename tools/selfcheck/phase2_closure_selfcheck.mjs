import { readFile } from 'node:fs/promises';
import { AStarRouter } from '../../src/routing/AStarRouter.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function validateRegionGraph(regionId, graphPath) {
  const graph = await loadJson(graphPath);
  const meta = graph?.meta || {};

  assert(meta.regionId === regionId, `${regionId}: meta.regionId mismatch`);
  assert(meta.formatVersion === 'v2', `${regionId}: meta.formatVersion must be v2`);
  assert(Number.isInteger(meta.bundleVersion) && meta.bundleVersion >= 1, `${regionId}: bundleVersion missing/invalid`);
  assert(typeof meta.source === 'string' && meta.source.includes('.osm.pbf'), `${regionId}: source must reference .osm.pbf`);
  assert(Number.isInteger(meta.nodeCount) && meta.nodeCount > 1000, `${regionId}: nodeCount too small`);
  assert(Number.isInteger(meta.edgeCount) && meta.edgeCount > 1000, `${regionId}: edgeCount too small`);
  assert(graph?.nodes && graph?.edges, `${regionId}: missing nodes/edges`);

  const connectedStart = Object.entries(graph.edges).find(([, edges]) => Array.isArray(edges) && edges.length > 0);
  assert(connectedStart, `${regionId}: no routable edges`);

  const [startId, startEdges] = connectedStart;
  const endId = startEdges[0].to;
  const router = new AStarRouter();
  await router.loadGraph(graph);
  const route = router.route(startId, endId, 'fastest');
  assert(route?.path?.length >= 2, `${regionId}: route probe failed`);
  assert(route.distance > 0 && route.duration > 0, `${regionId}: route metrics invalid`);
}

async function main() {
  const manifest = await loadJson('./tools/osm_pipeline/region_manifest.json');
  const regions = (manifest?.regions || []).filter((region) => region?.enabled !== false);
  assert(regions.length > 0, 'no enabled regions in manifest');

  for (const region of regions) {
    const regionId = region.id;
    const outputGraph = region.output_graph;
    assert(typeof regionId === 'string' && regionId, 'manifest region missing id');
    assert(typeof outputGraph === 'string' && outputGraph, `${regionId}: output_graph missing`);
    await validateRegionGraph(regionId, `./${outputGraph}`);
  }

  process.stdout.write(`[ok] phase-2 closure selfcheck: ${regions.length} regional graphs validated with routing probes\n`);
}

main().catch((error) => {
  process.stderr.write(`[fail] phase-2 closure selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
