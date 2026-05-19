import { readFile } from 'node:fs/promises';
import { Geocoder } from '../../src/routing/Geocoder.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyRustCoreContract() {
  const rustCore = await readFile('./native/rust-search/src/lib.rs', 'utf8');
  const rustBridge = await readFile('./src/search/RustSearchBridge.js', 'utf8');
  const geocoder = await readFile('./src/routing/Geocoder.js', 'utf8');

  assert(
    rustCore.includes('pub extern "C" fn rust_search_prepare_index'),
    'rust core export missing: rust_search_prepare_index',
  );
  assert(
    rustCore.includes('pub extern "C" fn rust_search_search'),
    'rust core export missing: rust_search_search',
  );
  assert(
    rustCore.includes('pub extern "C" fn rust_search_free_string'),
    'rust core export missing: rust_search_free_string',
  );
  assert(
    rustBridge.includes("this.nativeAvailable = Boolean(result?.nativeAvailable);"),
    'rust bridge native availability handling missing',
  );
  assert(
    geocoder.includes("this.searchBackend = status?.nativeAvailable && status?.prepared ? 'rust-native' : 'js-fallback';"),
    'geocoder rust-native preference missing',
  );
}

async function verifySearchQualityContract() {
  const geocoder = new Geocoder({ region: 'india' });
  geocoder.paritySampleRate = 0;

  const samples = [
    ['allahbad staton', 'Prayagraj Junction'],
    ['इलाहाबाद जंक्शन', 'Prayagraj Junction'],
    ['petrrol mumbaai', 'Indian Oil Colaba Fuel Station'],
    ['nearest ev charger', 'Tata Power EV Charging Hub'],
  ];

  for (const [query, expectedTop] of samples) {
    const results = await geocoder.search(query, 5);
    const top = results[0]?.name || '';
    assert(top === expectedTop, `query "${query}" expected "${expectedTop}" got "${top}"`);
  }
}

async function main() {
  await verifyRustCoreContract();
  await verifySearchQualityContract();
  process.stdout.write('[ok] phase-3 closure selfcheck: rust-search contract and multilingual quality checks verified\n');
}

main().catch((error) => {
  process.stderr.write(`[fail] phase-3 closure selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
