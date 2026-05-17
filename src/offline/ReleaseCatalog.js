let releaseCatalogPromise = null;

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

export async function loadReleaseCatalog() {
  if (!releaseCatalogPromise) {
    releaseCatalogPromise = fetchJson('/data/releases/catalog.json').catch((error) => {
      releaseCatalogPromise = null;
      throw error;
    });
  }
  return releaseCatalogPromise;
}

export async function getCatalogRegion(regionId) {
  const catalog = await loadReleaseCatalog().catch(() => null);
  return catalog?.regions?.find((region) => region.regionId === regionId) || null;
}

export function clearReleaseCatalogCache() {
  releaseCatalogPromise = null;
}
