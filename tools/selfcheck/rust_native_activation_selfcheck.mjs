import { readFile } from 'node:fs/promises';

function assertContains(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`Missing ${label}`);
  }
}

async function run() {
  const geocoder = await readFile('./src/routing/Geocoder.js', 'utf8');
  const bridge = await readFile('./src/search/RustSearchBridge.js', 'utf8');
  const androidPlugin = await readFile('./android/app/src/main/java/com/aimapsystem/app/RustSearchPlugin.java', 'utf8');
  const iosPlugin = await readFile('./ios/App/App/RustSearchPlugin.swift', 'utf8');

  assertContains(geocoder, "this.searchBackend = 'rust-native'", 'geocoder rust-native backend assignment');
  assertContains(geocoder, "this.searchBackend = status?.nativeAvailable && status?.prepared ? 'rust-native' : 'js-fallback';", 'prepareRegionIndex rust-native preference');
  assertContains(bridge, 'if (!this.nativeAvailable || !this.prepared)', 'bridge availability guard');
  assertContains(androidPlugin, 'result.put("nativeAvailable", RustSearchNativeBridge.isAvailable());', 'android native availability report');
  assertContains(iosPlugin, '"nativeAvailable": bridge.isAvailable', 'ios native availability report');
}

run()
  .then(() => {
    process.stdout.write('[ok] rust activation selfcheck: native path preference and fallback guards verified\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] rust activation selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
