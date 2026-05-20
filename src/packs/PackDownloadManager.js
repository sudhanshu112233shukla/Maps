import { Filesystem, Directory } from '@capacitor/filesystem';
import { GraphPackRegistry } from './GraphPackRegistry.js';

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const value of bytes) {
    hex += value.toString(16).padStart(2, '0');
  }
  return hex;
}

async function ensureDir(path) {
  await Filesystem.mkdir({ directory: Directory.Data, path, recursive: true }).catch(() => null);
}

async function writeJson(path, payload) {
  await Filesystem.writeFile({
    directory: Directory.Data,
    path,
    data: JSON.stringify(payload),
    encoding: 'utf8',
    recursive: true,
  });
}

async function readJson(path) {
  const content = await Filesystem.readFile({ directory: Directory.Data, path, encoding: 'utf8' }).catch(() => null);
  if (!content?.data) return null;
  try {
    return JSON.parse(content.data);
  } catch {
    return null;
  }
}

export class PackDownloadManager {
  constructor(options = {}) {
    this.registry = options.registry || new GraphPackRegistry();
  }

  // Download pack archive to temporary staging area.
  async downloadToTemp(regionId, url, onProgress = null) {
    const txRoot = `packs/${regionId}/download_tmp`;
    await ensureDir(txRoot);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Pack download failed (${response.status})`);

    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const archivePath = `${txRoot}/pack.zip`;
    await Filesystem.writeFile({ directory: Directory.Data, path: archivePath, data: base64, recursive: true });
    onProgress?.(1, 'Downloaded pack archive');
    return { archivePath, sizeBytes: buffer.byteLength };
  }

  async validateDownloadedPack(regionId, manifest) {
    const txRoot = `packs/${regionId}/download_tmp`;
    const archivePath = `${txRoot}/pack.zip`;
    const file = await Filesystem.readFile({ directory: Directory.Data, path: archivePath }).catch(() => null);
    if (!file?.data) throw new Error('Downloaded pack archive missing');

    const bytes = Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0));
    const digest = await sha256Hex(bytes.buffer);

    const validation = {
      regionId,
      checksum: digest,
      expectedChecksum: manifest?.checksum || null,
      graphhopperVersion: manifest?.graphhopperVersion || null,
      validChecksum: !manifest?.checksum || manifest.checksum === digest,
      validGraphhopperVersion: !manifest?.graphhopperVersion || manifest.graphhopperVersion === '9.0',
      validatedAt: new Date().toISOString(),
    };

    await ensureDir(`packs/${regionId}/validation`);
    await writeJson(`packs/${regionId}/validation/validation.json`, validation);

    if (!validation.validChecksum) throw new Error('Pack checksum mismatch');
    if (!validation.validGraphhopperVersion) throw new Error('GraphHopper version mismatch in pack');
    return validation;
  }

  // Note: extraction is expected to be handled by native unzip/extractor in production.
  async activateGraphPack(regionId, graphhopperDir, manifest) {
    await ensureDir(`packs/${regionId}/activation`);
    const activePointer = {
      regionId,
      graphhopperDir,
      graphVersion: manifest?.graphVersion || manifest?.dataVersion || 'unversioned',
      graphhopperVersion: manifest?.graphhopperVersion || '9.0',
      activatedAt: new Date().toISOString(),
    };

    await writeJson(`packs/${regionId}/activation/active_pointer.json`, activePointer);
    await this.registry.set(regionId, activePointer);
    return activePointer;
  }

  async getActivation(regionId) {
    const pointer = await readJson(`packs/${regionId}/activation/active_pointer.json`);
    return pointer || this.registry.get(regionId);
  }

  async rollbackActivation(regionId) {
    await this.registry.remove(regionId);
    return { rolledBack: true, regionId, at: new Date().toISOString() };
  }
}
