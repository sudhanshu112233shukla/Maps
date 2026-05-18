import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');

const SELFCHECK_LIST = [
  { name: "Melange Contract Integrity", cmd: "selfcheck:melange-contract" },
  { name: "Melange Runtime Checks", cmd: "selfcheck:melange-runtime" },
  { name: "Delta Manifest Sync", cmd: "selfcheck:delta" },
  { name: "OSM Graph Pipeline", cmd: "selfcheck:graph-pipeline" },
  { name: "Jetpack Compose Dashboard", cmd: "selfcheck:compose-shell" },
  { name: "Offline Region Manifests", cmd: "selfcheck:packs" },
  { name: "AI Config Validation", cmd: "selfcheck:models" },
  { name: "Performance Budgets Audit", cmd: "selfcheck:perf-budgets" },
  { name: "Offline Download Queue", cmd: "selfcheck:queue" },
  { name: "Release Promotion Integrity", cmd: "selfcheck:release-promotion" },
  { name: "Readiness Report Stability", cmd: "selfcheck:release-readiness" },
  { name: "Catalog Release States", cmd: "selfcheck:release-state" },
  { name: "Region Catalog Registry", cmd: "selfcheck:region-catalog" },
  { name: "A* Offline Route Engine", cmd: "selfcheck:routing" },
  { name: "Rust Search Core Activation", cmd: "selfcheck:rust-native" },
  { name: "Geocoding Transliteration Core", cmd: "selfcheck:search" },
  { name: "Storage Budgets Constraints", cmd: "selfcheck:storage" },
  { name: "Whisper Speech Pipeline Specs", cmd: "selfcheck:voice-pipeline" },
  { name: "Multilingual Geocoding Heuristics", cmd: "selfcheck:multilingual-eval" },
  { name: "Sustained Power Telemetry", cmd: "selfcheck:benchmarks" }
];

async function main() {
  console.log("==========================================================");
  console.log("     AI MAP SYSTEM UNIFIED SYSTEM INTEGRITY SELF-CHECK    ");
  console.log("==========================================================\n");

  let passedCount = 0;
  let failedCount = 0;
  const results = [];

  for (const [index, test] of SELFCHECK_LIST.entries()) {
    console.log(`[${index + 1}/${SELFCHECK_LIST.length}] Running ${test.name}...`);
    try {
      execSync(`npm run ${test.cmd}`, { cwd: repoRoot, stdio: 'pipe' });
      results.push({ name: test.name, status: "PASS", error: "none" });
      passedCount++;
      console.log(`  -> \x1b[32m[PASS]\x1b[0m\n`);
    } catch (err) {
      results.push({ name: test.name, status: "FAIL", error: err.message || "Command failed" });
      failedCount++;
      console.log(`  -> \x1b[31m[FAIL]\x1b[0m\n`);
    }
  }

  console.log("\n==========================================================");
  console.log("              DIAGNOSTIC TEST SUMMARY REPORT              ");
  console.log("==========================================================");
  console.table(
    results.map(r => ({
      "Diagnostic Module": r.name,
      "Status": r.status === "PASS" ? "🟢 PASS" : "🔴 FAIL"
    }))
  );

  console.log("----------------------------------------------------------");
  console.log(`TOTAL SUITES EXECUTED: ${SELFCHECK_LIST.length}`);
  console.log(`PASSED: \x1b[32m${passedCount}\x1b[0m`);
  console.log(`FAILED: \x1b[31m${failedCount}\x1b[0m`);
  console.log("==========================================================\n");

  if (failedCount > 0) {
    console.error("❌ Some diagnostic tests failed. Review logs above.");
    process.exit(1);
  } else {
    console.log("🎉 All 20 system integrity self-checks passed successfully!");
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
