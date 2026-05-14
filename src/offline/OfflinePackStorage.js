import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

const ROOT_DIR = 'melange-offline-packs';

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

export class OfflinePackStorage {
  constructor() {
    this.native = isNativeRuntime();
  }

  isNative() {
    return this.native;
  }

  async stageAssets(regionId, transactionId, manifest) {
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
    for (const asset of manifest.assets || []) {
      const response = await fetch(asset.path, { cache: 'no-store' });
      if (!response.ok) {
        if (asset.required === false) {
          continue;
        }
        throw new Error(`Failed to download asset ${asset.path}`);
      }

      const buffer = await response.arrayBuffer();
      if (asset.sha256) {
        const checksum = await sha256Hex(buffer);
        if (checksum.toLowerCase() !== String(asset.sha256).toLowerCase()) {
          throw new Error(`Checksum mismatch for ${asset.path}`);
        }
      }

      const relativePath = trimPublicPrefix(asset.path);
      const nativePath = `${stageDir}/${relativePath}`;
      const parentDir = nativePath.slice(0, nativePath.lastIndexOf('/'));
      await ensureDir(parentDir);
      await Filesystem.writeFile({
        path: nativePath,
        directory: Directory.Data,
        data: bufferToBase64(buffer),
      });

      const uri = await Filesystem.getUri({
        path: nativePath,
        directory: Directory.Data,
      });

      stagedAssets.push({
        ...asset,
        stagedPath: nativePath,
        activePath: Capacitor.convertFileSrc(uri.uri),
      });
    }

    return { stagedAssets, stageDir };
  }

  async stageDeltaAssets(regionId, transactionId, fullManifest, deltaManifest) {
    if (!this.native) {
      return this.stageAssets(regionId, transactionId, fullManifest);
    }

    const stageDir = `${ROOT_DIR}/${regionId}/staged/${transactionId}`;
    await ensureDir(stageDir);

    const patchByPath = new Map((deltaManifest.patchAssets || []).map((asset) => [asset.path, asset]));
    const deletedPaths = new Set(deltaManifest.deleteAssets || []);
    const activeDir = `${ROOT_DIR}/${regionId}/active`;
    const stagedAssets = [];

    for (const fullAsset of fullManifest.assets || []) {
      if (deletedPaths.has(fullAsset.path)) {
        continue;
      }

      const patchAsset = patchByPath.get(fullAsset.path) || null;
      const relativePath = trimPublicPrefix(fullAsset.path);
      const stagedPath = `${stageDir}/${relativePath}`;

      if (patchAsset) {
        const response = await fetch(patchAsset.path, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to download patch asset ${patchAsset.path}`);
        }
        const buffer = await response.arrayBuffer();
        if (patchAsset.sha256) {
          const checksum = await sha256Hex(buffer);
          if (checksum.toLowerCase() !== String(patchAsset.sha256).toLowerCase()) {
            throw new Error(`Checksum mismatch for patch ${patchAsset.path}`);
          }
        }
        await writeBase64File(stagedPath, bufferToBase64(buffer));
      } else {
        const activePath = `${activeDir}/${relativePath}`;
        try {
          const base64Data = await readNativeFileAsBase64(activePath);
          await writeBase64File(stagedPath, base64Data);
        } catch {
          const response = await fetch(fullAsset.path, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`Failed to fetch fallback asset ${fullAsset.path}`);
          }
          const buffer = await response.arrayBuffer();
          await writeBase64File(stagedPath, bufferToBase64(buffer));
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
}
