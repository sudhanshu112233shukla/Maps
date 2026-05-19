import { readFile } from 'node:fs/promises';

function assertContains(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`Missing ${label}`);
  }
}

async function main() {
  const mainActivity = await readFile(
    './native/android-compose/app/src/main/java/com/melange/maps/app/MainActivity.kt',
    'utf8',
  );
  const engineImpl = await readFile('./native/android-compose/core/impl/EngineImpl.kt', 'utf8');
  const architecture = await readFile('./docs/ARCHITECTURE.md', 'utf8');

  assertContains(mainActivity, 'setContent', 'Compose shell setContent');
  assertContains(mainActivity, 'MapLibreView', 'MapLibre view composable');
  assertContains(mainActivity, 'MapView(ctx)', 'MapLibre MapView initialization');
  assertContains(mainActivity, 'MainDashboard(', 'dashboard composition');
  assertContains(mainActivity, 'SearchEngine', 'search contract usage');
  assertContains(mainActivity, 'NavigationEngine', 'navigation contract usage');
  assertContains(mainActivity, 'AiEngine', 'ai contract usage');
  assertContains(mainActivity, 'MapPackManager', 'pack manager contract usage');

  assertContains(engineImpl, 'class SearchEngineImpl : SearchEngine', 'search engine implementation');
  assertContains(engineImpl, 'class NavigationEngineImpl : NavigationEngine', 'navigation engine implementation');
  assertContains(engineImpl, 'class AiEngineImpl : AiEngine', 'ai engine implementation');
  assertContains(engineImpl, 'class MapPackManagerImpl : MapPackManager', 'pack manager implementation');

  assertContains(
    architecture,
    'currently runs a Capacitor runtime used to iterate quickly',
    'capacitor regression harness note',
  );

  process.stdout.write('[ok] phase-4 closure selfcheck: compose shell, maplibre view, contracts, and harness docs verified\n');
}

main().catch((error) => {
  process.stderr.write(`[fail] phase-4 closure selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
