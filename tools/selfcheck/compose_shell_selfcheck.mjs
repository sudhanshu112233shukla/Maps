import { readFile } from 'node:fs/promises';

function assertContains(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`Missing ${label}`);
  }
}

async function run() {
  const rootGradle = await readFile('./native/android-compose/build.gradle.kts', 'utf8');
  const settingsGradle = await readFile('./native/android-compose/settings.gradle.kts', 'utf8');
  const appGradle = await readFile('./native/android-compose/app/build.gradle.kts', 'utf8');
  const activity = await readFile(
    './native/android-compose/app/src/main/java/com/melange/maps/app/MainActivity.kt',
    'utf8',
  );

  assertContains(rootGradle, 'com.android.application', 'android application plugin declaration');
  assertContains(settingsGradle, 'include(":app")', 'app module include');
  assertContains(appGradle, 'compose = true', 'compose build feature');
  assertContains(activity, 'setContent', 'compose activity setContent');
}

run()
  .then(() => {
    process.stdout.write('[ok] compose shell selfcheck: native module scaffold is present\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] compose shell selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
