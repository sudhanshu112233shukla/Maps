import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { ChunkDownloadState } from './ChunkDownloadState.js';

const ROOT_DIR = 'melange-offline-packs';
const CHUNK_SIZE_BYTES = 1024 * 1024;

function isNativeRuntime() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function toHex(bytes) {
  let hex = '';
  for (const value of bytes) {
    hex += value.toString(16).padStart(2, '0');
  }
  return hex;
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return toHex(new Uint8Array(digest));
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function trimPublicPrefix(path) {
  return path.startsWith('/') ? path.slice(1) : path;
}

async function ensureDir(path) {
  await Filesystem.mkdir({
    path,
    directory: Directory.Data,
    recursive: true,
  }).catch(() => null);
}

async function removeDir(path) {
  await Filesystem.rmdir({
    path,
    directory: Directory.Data,
    recursive: true,
  }).catch(() => null);
}

async function renameDir(from, to) {
  await Filesystem.rename({
    from,
    to,
    directory: Directory.Data,
  });
}

async function readNativeFileAsBuffer(path) {
  const result = await Filesystem.readFile({
    path,
    directory: Directory.Data,
  });
  return base64ToBuffer(result.data);
}

async function readNativeFileAsBase64(path) {
  const result = await Filesystem.readFile({
    path,
    directory: Directory.Data,
  });
  return result.data;
}

async function writeBase64File(path, data) {
  const parentDir = path.slice(0, path.lastIndexOf('/'));
  await ensureDir(parentDir);
  await Filesystem.writeFile({
    path,
    directory: Directory.Data,
    data,
  });
}

async function getContentLength(path) {
  const response = await fetch(path, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
  const value = response?.headers?.get('content-length');
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export class OfflinePackStorage {
  constructor() {
    this.native = isNativeRuntime();
    this.chunkState = new ChunkDownloadState();
  }

  isNative() {
    return this.native;
  }

  async stageAssets(regionId, transactionId, manifest, onProgress = null) {
    if (!this.native) {
      return {
        stagedAssets: (manifest.assets || []).map((asset) => ({
          ...asset,
          activePath: asset.path,
          stagedPath: null,
        })),
        stageDir: null,
      };
    }

    const stageDir = `${ROOT_DIR}/${regionId}/staged/${transactionId}`;
    await ensureDir(stageDir);

    const stagedAssets = [];
    const requiredAssets = (manifest.assets || []).filter((asset) => asset.required !== false);
    const totalAssets = Math.max(1, requiredAssets.length);
    let completedAssets = 0;

    for (const asset of manifest.assets || []) {
      const relativePath = trimPublicPrefix(asset.path);
      const nativePath = `${stageDir}/${relativePath}`;
      await this.#downloadAssetResumable(
        regionId,
        transactionId,
        asset.path,
        nativePath,
        asset.sha256,
        (fraction) => {
          const overall = (completedAssets + Math.max(0, Math.min(1, fraction))) / totalAssets;
          onProgress?.(overall, asset.path);
        },
      );

      const uri = await Filesystem.getUri({
        path: nativePath,
        directory: Directory.Data,
      });

      stagedAssets.push({
        ...asset,
        stagedPath: nativePath,
        activePath: Capacitor.convertFileSrc(uri.uri),
      });
      completedAssets += 1;
      onProgress?.(completedAssets / totalAssets, asset.path);
    }

    return { stagedAssets, stageDir };
  }

  async stageDeltaAssets(regionId, transactionId, fullManifest, deltaManifest, onProgress = null) {
    if (!this.native) {
      return this.stageAssets(regionId, transactionId, fullManifest);
    }

    const stageDir = `${ROOT_DIR}/${regionId}/staged/${transactionId}`;
    await ensureDir(stageDir);

    const patchByPath = new Map((deltaManifest.patchAssets || []).map((asset) => [asset.path, asset]));
    const deletedPaths = new Set(deltaManifest.deleteAssets || []);
    const activeDir = `${ROOT_DIR}/${regionId}/active`;
    const stagedAssets = [];

    const totalAssets = Math.max(1, (fullManifest.assets || []).length);
    let completedAssets = 0;

    for (const fullAsset of fullManifest.assets || []) {
      if (deletedPaths.has(fullAsset.path)) {
        continue;
      }

      const patchAsset = patchByPath.get(fullAsset.path) || null;
      const relativePath = trimPublicPrefix(fullAsset.path);
      const stagedPath = `${stageDir}/${relativePath}`;

      if (patchAsset) {
        await this.#downloadAssetResumable(
          regionId,
          transactionId,
          patchAsset.path,
          stagedPath,
          patchAsset.sha256 || fullAsset.sha256,
          (fraction) => {
            const overall = (completedAssets + Math.max(0, Math.min(1, fraction))) / totalAssets;
            onProgress?.(overall, fullAsset.path);
          },
        );
      } else {
        const activePath = `${activeDir}/${relativePath}`;
        try {
          const base64Data = await readNativeFileAsBase64(activePath);
          await writeBase64File(stagedPath, base64Data);
          onProgress?.((completedAssets + 1) / totalAssets, fullAsset.path);
        } catch {
          const response = await fetch(fullAsset.path, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`Failed to fetch fallback asset ${fullAsset.path}`);
          }
          const buffer = await response.arrayBuffer();
          await writeBase64File(stagedPath, bufferToBase64(buffer));
          onProgress?.((completedAssets + 1) / totalAssets, fullAsset.path);
        }
      }

      const uri = await Filesystem.getUri({
        path: stagedPath,
        directory: Directory.Data,
      });

      stagedAssets.push({
        ...fullAsset,
        stagedPath,
        activePath: Capacitor.convertFileSrc(uri.uri),
      });
      completedAssets += 1;
      onProgress?.(completedAssets / totalAssets, fullAsset.path);
    }

    return { stagedAssets, stageDir };
  }

  async verifyStagedAssets(stagedAssets) {
    if (!this.native) {
      return;
    }
    for (const asset of stagedAssets || []) {
      if (!asset.sha256 || !asset.stagedPath) {
        continue;
      }
      const buffer = await readNativeFileAsBuffer(asset.stagedPath);
      const checksum = await sha256Hex(buffer);
      if (checksum.toLowerCase() !== String(asset.sha256).toLowerCase()) {
        throw new Error(`Checksum mismatch for staged ${asset.path}`);
      }
    }
  }

  async activateStagedRegion(regionId, transactionId, stagedAssets, stageDir) {
    if (!this.native) {
      return {
        assets: stagedAssets,
        rollbackToken: null,
      };
    }

    const regionRoot = `${ROOT_DIR}/${regionId}`;
    const activeDir = `${regionRoot}/active`;
    const backupDir = `${regionRoot}/backup-${transactionId}`;

    await ensureDir(regionRoot);
    await removeDir(backupDir);

    let hasActive = true;
    try {
      await renameDir(activeDir, backupDir);
    } catch {
      hasActive = false;
    }

    try {
      await renameDir(stageDir, activeDir);
    } catch (error) {
      if (hasActive) {
        await renameDir(backupDir, activeDir).catch(() => null);
      }
      throw error;
    }

    const activatedAssets = [];
    for (const asset of stagedAssets) {
      const relativePath = trimPublicPrefix(asset.path);
      const nativePath = `${activeDir}/${relativePath}`;
      const uri = await Filesystem.getUri({
        path: nativePath,
        directory: Directory.Data,
      });
      activatedAssets.push({
        ...asset,
        activePath: Capacitor.convertFileSrc(uri.uri),
      });
    }

    return {
      assets: activatedAssets,
      rollbackToken: { activeDir, backupDir, hasBackup: hasActive },
    };
  }

  async rollbackActivation(rollbackToken) {
    if (!this.native || !rollbackToken) {
      return;
    }
    const { activeDir, backupDir, hasBackup } = rollbackToken;
    if (!hasBackup) {
      return;
    }
    await removeDir(activeDir);
    await renameDir(backupDir, activeDir).catch(() => null);
  }

  async #downloadAssetResumable(
    regionId,
    transactionId,
    sourcePath,
    stagedPath,
    expectedSha256,
    onProgress = null,
  ) {
    const existing = await this.chunkState.get(regionId, transactionId, sourcePath);
    const totalBytes = (await getContentLength(sourcePath)) || existing?.totalBytes || null;
    let downloadedBytes = Number.isFinite(existing?.downloadedBytes) ? existing.downloadedBytes : 0;
    let started = downloadedBytes > 0;
    let retryCount = existing?.retryCount || 0;

    await this.chunkState.upsert(regionId, transactionId, sourcePath, {
      status: 'downloading',
      totalBytes,
      downloadedBytes,
      retryCount,
      lastError: null,
    });

    if (totalBytes === null) {
      const response = await fetch(sourcePath, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to download ${sourcePath}: HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      await writeBase64File(stagedPath, bufferToBase64(buffer));
      downloadedBytes = buffer.byteLength;
      onProgress?.(1);
    }

    while (totalBytes !== null && downloadedBytes < totalBytes) {
      const nextEnd =
        totalBytes === null
          ? downloadedBytes + CHUNK_SIZE_BYTES - 1
          : Math.min(downloadedBytes + CHUNK_SIZE_BYTES - 1, totalBytes - 1);
      const rangeHeader = `bytes=${downloadedBytes}-${nextEnd}`;

      try {
        const response = await fetch(sourcePath, {
          cache: 'no-store',
          headers: { Range: rangeHeader },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const base64Data = bufferToBase64(buffer);
        if (!started || downloadedBytes === 0) {
          await writeBase64File(stagedPath, base64Data);
          started = true;
        } else {
          await Filesystem.appendFile({
            path: stagedPath,
            directory: Directory.Data,
            data: base64Data,
          });
        }
        downloadedBytes += buffer.byteLength;
        const fraction = totalBytes > 0 ? downloadedBytes / totalBytes : 0;
        onProgress?.(Math.max(0, Math.min(1, fraction)));
        await this.chunkState.upsert(regionId, transactionId, sourcePath, {
          status: 'downloading',
          totalBytes,
          downloadedBytes,
          retryCount,
          lastError: null,
        });

        if (buffer.byteLength === 0) {
          break;
        }
      } catch (error) {
        retryCount += 1;
        await this.chunkState.upsert(regionId, transactionId, sourcePath, {
          status: 'retrying',
          totalBytes,
          downloadedBytes,
          retryCount,
          lastError: error?.message || 'Chunk download failed',
        });
        if (retryCount >= 5) {
          throw new Error(`Failed to download ${sourcePath} after ${retryCount} retries`);
        }
      }
    }

    if (expectedSha256) {
      const buffer = await readNativeFileAsBuffer(stagedPath);
      const checksum = await sha256Hex(buffer);
      if (checksum.toLowerCase() !== String(expectedSha256).toLowerCase()) {
        await this.chunkState.upsert(regionId, transactionId, sourcePath, {
          status: 'failed',
          totalBytes,
          downloadedBytes,
          lastError: 'Checksum mismatch',
        });
        throw new Error(`Checksum mismatch for ${sourcePath}`);
      }
    }

    await this.chunkState.upsert(regionId, transactionId, sourcePath, {
      status: 'completed',
      totalBytes,
      downloadedBytes,
      lastError: null,
    });
    onProgress?.(1);
  }
}
