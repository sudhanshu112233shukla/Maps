import { Geocoder } from '../../src/routing/Geocoder.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

async function expectTop(query, expectedName) {
  const geocoder = new Geocoder({ region: 'india' });
  geocoder.paritySampleRate = 0;
  const results = await geocoder.search(query, 5);
  const topName = results[0]?.name || '';
  assert(
    topName === expectedName,
    `Expected "${query}" to rank "${expectedName}" first, got "${topName}"`,
  );
}

async function run() {
  await expectTop('allahabad station', 'Prayagraj Junction');
  await expectTop('prayagraj railway', 'Prayagraj Junction');
  await expectTop('\u0907\u0932\u093e\u0939\u093e\u092c\u093e\u0926 \u091c\u0902\u0915\u094d\u0936\u0928', 'Prayagraj Junction');
  await expectTop('petrol near mumbai', 'Indian Oil Colaba Fuel Station');
  await expectTop('nearest ev charger', 'Tata Power EV Charging Hub');
  await expectTop('washroom service plaza', 'Expressway Food Plaza Lonavala');
}

run()
  .then(() => {
    process.stdout.write('[ok] search selfcheck: multilingual and automotive intents ranked correctly\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] search selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
