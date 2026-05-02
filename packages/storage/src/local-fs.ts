import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { type Storage, StorageError, assertValidKey } from './types';

/**
 * Filesystem-backed storage for self-hosted deployments and tests.
 * Path traversal is locked down two ways: keys are pre-validated by
 * assertValidKey, and every resolved path is then asserted to live under root.
 */
export class LocalFsStorage implements Storage {
  private readonly root: string;

  constructor(root: string) {
    if (!isAbsolute(root)) {
      throw new StorageError(`storage root must be absolute: ${root}`, 'backend_error');
    }
    this.root = resolve(root);
  }

  private toPath(key: string): string {
    assertValidKey(key);
    const full = resolve(this.root, key);
    // Belt-and-suspenders: even with a valid key, refuse anything that resolved outside root.
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new StorageError(`resolved path escapes root: ${key}`, 'invalid_key');
    }
    return full;
  }

  async put(key: string, body: Buffer, _mime: string): Promise<{ key: string }> {
    const path = this.toPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key };
  }

  async get(key: string): Promise<Buffer> {
    const path = this.toPath(key);
    try {
      return await readFile(path);
    } catch (err) {
      if (isEnoent(err)) throw new StorageError(`not found: ${key}`, 'not_found');
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.toPath(key);
    // rm with force=true is idempotent — ignores ENOENT.
    await rm(path, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    const path = this.toPath(key);
    try {
      await stat(path);
      return true;
    } catch (err) {
      if (isEnoent(err)) return false;
      throw err;
    }
  }

  // join exposed for tests / CLI tooling.
  pathFor(key: string): string {
    return join(this.root, key);
  }
}

function isEnoent(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}
