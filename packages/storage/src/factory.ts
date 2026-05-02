import { LocalFsStorage } from './local-fs';
import { R2Storage } from './r2';
import type { Storage } from './types';

export interface StorageEnv {
  STORAGE_BACKEND?: string;
  STORAGE_DIR?: string;
  R2_BUCKET?: string;
}

/**
 * Pick a storage backend from env. Fails fast if config is incoherent
 * (e.g. backend=r2 with no bucket name) — better here than at first upload.
 */
export function createStorage(env: StorageEnv): Storage {
  const backend = env.STORAGE_BACKEND ?? 'local';
  if (backend === 'local') {
    const dir = env.STORAGE_DIR;
    if (!dir) {
      throw new Error('STORAGE_BACKEND=local requires STORAGE_DIR');
    }
    return new LocalFsStorage(dir);
  }
  if (backend === 'r2') {
    const bucket = env.R2_BUCKET;
    if (!bucket) {
      throw new Error('STORAGE_BACKEND=r2 requires R2_BUCKET');
    }
    return new R2Storage(bucket);
  }
  throw new Error(`unknown STORAGE_BACKEND: ${backend}`);
}

export const MIME_BY_EXT: Readonly<Record<string, string>> = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
});

/** Best-effort mime lookup from a key's extension; returns 'application/octet-stream' as fallback. */
export function mimeFromKey(key: string): string {
  const dot = key.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  const ext = key.slice(dot + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
