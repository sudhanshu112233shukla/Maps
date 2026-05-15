const STORAGE_SAFETY_MULTIPLIER = 1.15;
const STORAGE_MIN_RESERVE_BYTES = 64 * 1024 * 1024;

export function estimateRequiredBytesFromAssets(assets = []) {
  let total = 0;
  for (const asset of assets) {
    if (asset?.required === false) {
      continue;
    }
    const sizeBytes = Number.isFinite(asset?.sizeBytes) ? asset.sizeBytes : null;
    if (!sizeBytes || sizeBytes <= 0) {
      continue;
    }
    total += sizeBytes;
  }
  return Math.max(0, Math.round(total));
}

export function canFitStorage(requiredBytes, availableBytes) {
  if (!Number.isFinite(requiredBytes) || requiredBytes <= 0) {
    return { fits: true, thresholdBytes: 0 };
  }
  if (!Number.isFinite(availableBytes) || availableBytes < 0) {
    return { fits: true, thresholdBytes: 0 };
  }
  const thresholdBytes = Math.round(requiredBytes * STORAGE_SAFETY_MULTIPLIER) + STORAGE_MIN_RESERVE_BYTES;
  return { fits: availableBytes >= thresholdBytes, thresholdBytes };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'unknown';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${unit}`;
}
