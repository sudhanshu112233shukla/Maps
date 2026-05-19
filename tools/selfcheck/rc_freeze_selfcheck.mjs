import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const PUBLIC_ROOT = path.join(REPO_ROOT, 'public');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function fileSha256(publicPath) {
  const resolved = path.join(PUBLIC_ROOT, publicPath.replace(/^\//, ''));
  const payload = await readFile(resolved);
  return sha256(payload);
}

function gitHead() {
  return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const lockPath = path.join(PUBLIC_ROOT, 'data', 'releases', 'rc.lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));

  assert(lock.schemaVersion === 1, 'rc.lock.json schemaVersion must be 1');
  assert(typeof lock.gitHead === 'string' && lock.gitHead.length >= 7, 'rc.lock.json missing gitHead');

  const head = gitHead();
  assert(lock.gitHead === head, `rc.lock.json gitHead mismatch: lock=${lock.gitHead} head=${head}`);

  for (const entry of Object.values(lock.inputs || {})) {
    assert(entry?.path && entry?.sha256, 'rc lock input entry invalid');
    const actual = await fileSha256(entry.path);
    assert(
      actual.toLowerCase() === String(entry.sha256).toLowerCase(),
      `rc input hash mismatch for ${entry.path}`,
    );
  }

  for (const [regionId, pack] of Object.entries(lock.packs || {})) {
    assert(pack?.manifest?.path && pack?.manifest?.sha256, `rc lock missing manifest entry for ${regionId}`);
    assert(pack?.delta?.path && pack?.delta?.sha256, `rc lock missing delta entry for ${regionId}`);

    const manifestActual = await fileSha256(pack.manifest.path);
    assert(
      manifestActual.toLowerCase() === String(pack.manifest.sha256).toLowerCase(),
      `rc manifest hash mismatch for ${regionId}`,
    );

    const deltaActual = await fileSha256(pack.delta.path);
    assert(
      deltaActual.toLowerCase() === String(pack.delta.sha256).toLowerCase(),
      `rc delta hash mismatch for ${regionId}`,
    );
  }

  process.stdout.write('[ok] rc freeze selfcheck: release inputs are locked to HEAD and hashes match\n');
}

main().catch((error) => {
  process.stderr.write(`[fail] rc freeze selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
});

