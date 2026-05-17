import { strict as assert } from 'node:assert';
import {
  buildMelangeRuntimeConfig,
  buildPredictiveCachePlan,
  semanticRankCandidates,
} from '../../src/ai/MelangeModelRegistry.js';

function main() {
  const lowEnd = buildMelangeRuntimeConfig({ deviceMemoryGb: 4, locale: 'en-IN' });
  assert.equal(lowEnd.deviceClass, 'lowEnd');
  assert.equal(lowEnd.llmModelName, 'LiquidAI/LFM2.5-1.2B-Instruct');
  assert.equal(lowEnd.speechEncoderModelName, 'ZETIC-ai/whisper-base-encoder');

  const highEnd = buildMelangeRuntimeConfig({ deviceMemoryGb: 12, locale: 'en-US' });
  assert.equal(highEnd.deviceClass, 'highEnd');
  assert.equal(highEnd.llmModelName, 'google/gemma-3-4b-it');

  const ranked = semanticRankCandidates(
    'fuel near highway',
    [
      { id: '1', name: 'Tea stop', category: 'restaurant', distanceMeters: 100 },
      { id: '2', name: 'Highway Fuel Hub', category: 'fuel', distanceMeters: 500 },
    ],
    2,
  );
  assert.equal(ranked[0]?.id, '2');

  const cachePlan = buildPredictiveCachePlan({
    regionId: 'india',
    vehicleProfile: 'automobile',
    onHighway: true,
    route: { mode: 'eco', poi: 'charging' },
  });
  assert.equal(cachePlan.regionId, 'india');
  assert(cachePlan.assetHints.includes('map:india'));
  assert(cachePlan.poiCategories.includes('charging'));
  assert(cachePlan.poiCategories.includes('fuel'));
  assert(cachePlan.warmRouteModes.includes('eco'));

  process.stdout.write('[ok] melange runtime selfcheck: config, ranking, and cache plan validated\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`[fail] melange runtime selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
}
