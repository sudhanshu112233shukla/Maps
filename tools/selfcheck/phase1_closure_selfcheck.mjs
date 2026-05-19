import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function assertContains(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`missing ${label}: ${needle}`);
  }
}

function main() {
  const repoRoot = process.cwd();
  const roadmap = readFileSync(join(repoRoot, 'docs/PRODUCTION_ROADMAP.md'), 'utf8');
  const iosPlugin = readFileSync(
    join(repoRoot, 'ios/App/App/MelangeNavigationPlugin.swift'),
    'utf8',
  );

  assertContains(roadmap, 'Phase 1 is accepted as complete for user-release baseline.', 'phase-1 closure marker');
  assertContains(iosPlugin, '"supportsSpeechRuntime": nativeSpeechReady', 'iOS truthful speech runtime capability');
  assertContains(iosPlugin, '"thermalStatus": "unknown"', 'iOS neutral thermal telemetry');
  assertContains(iosPlugin, '"batteryLevel": NSNull()', 'iOS neutral battery telemetry');

  process.stdout.write('[ok] phase-1 closure selfcheck: roadmap + iOS runtime flags verified\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`[fail] phase-1 closure selfcheck: ${error?.message || error}\n`);
  process.exitCode = 1;
}
