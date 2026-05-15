import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

async function run() {
  const graph = JSON.parse(await readFile('./public/data/graph/india.json', 'utf8'));
  const meta = graph?.meta || {};

  assert(meta.formatVersion === 'v2', 'graph meta.formatVersion must be v2');
  assert(typeof meta.source === 'string' && meta.source.includes('.osm.pbf'), 'graph source must be OSM PBF');
  assert(Number.isInteger(meta.nodeCount) && meta.nodeCount >= 100000, 'graph nodeCount too small for production');
  assert(Number.isInteger(meta.edgeCount) && meta.edgeCount >= 150000, 'graph edgeCount too small for production');
}

run()
  .then(() => {
    process.stdout.write('[ok] graph pipeline selfcheck: generated graph metadata looks production-grade\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] graph pipeline selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
