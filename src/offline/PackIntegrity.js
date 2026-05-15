async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const value of bytes) {
    hex += value.toString(16).padStart(2, '0');
  }
  return hex;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

export async function loadPackManifest(regionId) {
  if (!regionId) return null;
  const manifestPath = `/data/packs/${regionId}.manifest.json`;
  const manifest = await fetchJson(manifestPath);
  if (!manifest || !Array.isArray(manifest.assets)) {
    return null;
  }
  return manifest;
}

export async function loadDeltaManifest(regionId) {
  if (!regionId) return null;
  const manifestPath = `/data/packs/${regionId}.delta.json`;
  const manifest = await fetchJson(manifestPath);
  if (!manifest || !Array.isArray(manifest.patchAssets) || !Array.isArray(manifest.deleteAssets)) {
    return null;
  }
  return manifest;
}

export function validateDeltaManifest(deltaManifest, fullManifest) {
  if (!deltaManifest || !fullManifest) {
    return { valid: false, reason: 'missing-manifest' };
  }
  if (!Array.isArray(fullManifest.assets)) {
    return { valid: false, reason: 'invalid-full-assets' };
  }
  if (!Array.isArray(deltaManifest.patchAssets) || !Array.isArray(deltaManifest.deleteAssets)) {
    return { valid: false, reason: 'invalid-delta-shape' };
  }

  const fullPaths = new Set(fullManifest.assets.map((asset) => asset.path).filter(Boolean));
  for (const patchAsset of deltaManifest.patchAssets) {
    if (!patchAsset?.path || !fullPaths.has(patchAsset.path)) {
      return { valid: false, reason: `unknown-patch-asset:${patchAsset?.path || 'null'}` };
    }
  }
  for (const deletedPath of deltaManifest.deleteAssets) {
    if (!deletedPath || !fullPaths.has(deletedPath)) {
      return { valid: false, reason: `unknown-delete-asset:${deletedPath || 'null'}` };
    }
  }

  return { valid: true, reason: null };
}

export function findAssetInManifest(manifest, path) {
  if (!manifest?.assets || !path) {
    return null;
  }
  return manifest.assets.find((asset) => asset.path === path) || null;
}

export async function verifyAssetChecksum(path, sha256) {
  if (!path || !sha256) {
    return false;
  }
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    return false;
  }
  const buffer = await response.arrayBuffer();
  const hash = await sha256Hex(buffer);
  return hash.toLowerCase() === String(sha256).toLowerCase();
}

export async function fetchAssetContentLength(path) {
  if (!path) {
    return null;
  }
  const response = await fetch(path, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
  if (!response?.ok) {
    return null;
  }
  const value = response.headers.get('content-length');
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
