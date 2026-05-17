import { readFile } from 'node:fs/promises';

function assertContains(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`Missing ${label}`);
  }
}

async function run() {
  const androidPlugin = await readFile(
    './android/app/src/main/java/com/aimapsystem/app/MelangeNavigationPlugin.java',
    'utf8',
  );
  const iosPlugin = await readFile(
    './ios/App/App/MelangeNavigationPlugin.swift',
    'utf8',
  );

  for (const method of ['prepare', 'parseRouteIntent', 'chatNavigation', 'transcribeNavigationCommand', 'rankPoiCandidates', 'predictOfflineCache']) {
    assertContains(androidPlugin, `public void ${method}(`, `Android ${method} method`);
    assertContains(iosPlugin, `func ${method}(`, `iOS ${method} method`);
  }

  assertContains(androidPlugin, 'native-fallback', 'Android fallback runtime marker');
  assertContains(iosPlugin, 'native-fallback', 'iOS fallback runtime marker');
  assertContains(androidPlugin, 'transcribeNavigationCommand', 'Android transcribe method');
  assertContains(iosPlugin, 'transcribeNavigationCommand', 'iOS transcribe method');
  assertContains(androidPlugin, 'Speech model integration requires melange tensor I/O wiring', 'Android speech fallback-safe message');
  assertContains(iosPlugin, 'Speech model tensor I/O integration is not implemented', 'iOS speech fallback-safe message');

  assertContains(androidPlugin, 'supportsNativeMelange', 'Android capability response');
  assertContains(iosPlugin, 'supportsNativeMelange', 'iOS capability response');
  assertContains(androidPlugin, 'speechEncoderModelName', 'Android speech encoder config');
  assertContains(iosPlugin, 'speechEncoderModelName', 'iOS speech encoder config');
  assertContains(androidPlugin, 'deviceClass', 'Android device class config');
  assertContains(iosPlugin, 'deviceClass', 'iOS device class config');
}

run()
  .then(() => {
    process.stdout.write('[ok] melange contract selfcheck: android/ios plugin contracts present\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] melange contract selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
