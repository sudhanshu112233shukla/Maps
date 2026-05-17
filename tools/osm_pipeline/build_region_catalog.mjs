import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFLINE_REGIONS } from '../../src/offline/offlineRegions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

async function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

async function fileMeta(publicPath) {
  if (!publicPath?.startsWith('/')) {
    return { exists: false, path: publicPath || null };
  }

  const absolutePath = path.join(repoRoot, 'public', publicPath.replace(/^\/+/, ''));
  try {
    const fileStat = await stat(absolutePath);
    const buffer = await readFile(absolutePath);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    return {
      exists: true,
      path: publicPath,
      sizeBytes: fileStat.size,
      sha256,
    };
  } catch {
    return { exists: false, path: publicPath };
  }
}

async function main() {
  const manifest = await readJson('tools/osm_pipeline/region_manifest.json');
  const readiness = await readJson('public/data/releases/readiness.json');
  const readinessById = new Map((readiness.regions || []).map((region) => [region.regionId, region]));
  const manifestById = new Map((manifest.regions || []).map((region) => [region.id, region]));

  const regions = await Promise.all(
    OFFLINE_REGIONS.map(async (region) => {
      const manifestRegion = manifestById.get(region.id) || {};
      const graph = await fileMeta(region.graphPath);
      const poi = await fileMeta(region.poiPath);
      const map = await fileMeta(region.bundledPackPath);
      const packManifest = await fileMeta(`/data/packs/${region.id}.manifest.json`);
      const packDelta = await fileMeta(`/data/packs/${region.id}.delta.json`);
      const readinessRegion = readinessById.get(region.id) || {};

      return {
        regionId: region.id,
        name: region.name,
        releaseStatus: region.releaseStatus,
        releasePriority: region.releasePriority,
        dataVersion: region.dataVersion,
        manifestEnabled: Boolean(manifestRegion.enabled),
        releaseReady: Boolean(readinessRegion.releaseReady),
        missing: readinessRegion.missing || [],
        assets: {
          graph,
          poi,
          map,
          packManifest,
          packDelta,
        },
      };
    }),
  );

  const summary = {
    totalRegions: regions.length,
    releasedRegions: regions.filter((region) => region.releaseStatus === 'released').length,
    releaseReadyRegions: regions.filter((region) => region.releaseReady).length,
    graphReadyRegions: regions.filter((region) => region.assets.graph.exists).length,
    mapReadyRegions: regions.filter((region) => region.assets.map.exists).length,
  };

  const output = {
    generatedAtUtc: new Date().toISOString(),
    summary,
    regions,
  };

  const releasesDir = path.join(repoRoot, 'public', 'data', 'releases');
  await mkdir(releasesDir, { recursive: true });
  await writeFile(
    path.join(releasesDir, 'catalog.json'),
    `${JSON.stringify(output, null, 2)}\n`,
    'utf8',
  );

  process.stdout.write(
    `[ok] region catalog: regions=${summary.totalRegions} releaseReady=${summary.releaseReadyRegions} graphReady=${summary.graphReadyRegions}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`[fail] region catalog: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
