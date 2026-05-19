import { readFile } from 'node:fs/promises';

function assertContains(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`Missing ${label}`);
  }
}

async function main() {
  const roadmap = await readFile('./docs/PRODUCTION_ROADMAP.md', 'utf8');
  const releasePlan = await readFile('./docs/RELEASE_EXECUTION_PLAN.md', 'utf8');

  const closedMarkers = [
    '## Phase 1: Native Melange Runtime (Closed for User Release Baseline)',
    '## Phase 2: Production Routing Data (Closed for User Release Baseline)',
    '## Phase 3: Search Core Migration (Closed for User Release Baseline)',
    '## Phase 4: Native App Shell (Closed for User Release Baseline)',
    '## Phase 5: Pack Update and Operations (Closed for User Release Baseline)',
  ];

  for (const marker of closedMarkers) {
    assertContains(roadmap, marker, `roadmap marker: ${marker}`);
  }

  assertContains(releasePlan, '## Stage 1: Release Candidate Freeze', 'rc freeze stage');
  assertContains(releasePlan, '## Stage 2: Device Validation Matrix', 'device validation stage');
  assertContains(releasePlan, '## Stage 3: Operations Readiness', 'operations stage');
  assertContains(releasePlan, '## Stage 4: Pilot Rollout', 'pilot stage');
  assertContains(releasePlan, '## Stage 5: GA Launch', 'ga stage');

  process.stdout.write('[ok] release execution selfcheck: roadmap closure + post-phase release plan verified\n');
}

main().catch((error) => {
  process.stderr.write(`[fail] release execution selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
