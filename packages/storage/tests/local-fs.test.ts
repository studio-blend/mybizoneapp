/**
 * LocalFsStorage round-trip + path-traversal smoke tests.
 *
 * Real storage on disk under a tmp dir; cleanup in afterEach. We test:
 *   - put/get/exists/delete happy path
 *   - delete is idempotent
 *   - get on missing key throws not_found
 *   - invalid keys (traversal, leading slash, dot-segments) are rejected
 *   - resolved path that escapes root is rejected (defense in depth)
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalFsStorage } from '../src/local-fs';
import { StorageError } from '../src/types';

let root = '';
let storage: LocalFsStorage;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mybizone-storage-'));
  storage = new LocalFsStorage(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('LocalFsStorage', () => {
  it('round-trip: put → exists → get → delete → exists', async () => {
    const key = 'products/abc-123/widget.png';
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);

    await storage.put(key, body, 'image/png');
    expect(await storage.exists(key)).toBe(true);

    const back = await storage.get(key);
    expect(back.equals(body)).toBe(true);

    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it('delete is idempotent (no throw on missing)', async () => {
    await expect(storage.delete('products/missing/file.png')).resolves.toBeUndefined();
  });

  it('get on missing key throws StorageError(not_found)', async () => {
    await expect(storage.get('products/x/missing.png')).rejects.toBeInstanceOf(StorageError);
    await expect(storage.get('products/x/missing.png')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it.each([
    ['../etc/passwd'],
    ['/absolute.png'],
    ['products/../escape.png'],
    ['products//double.png'],
    ['products/.hidden.png'],
    ['Products/UPPER.png'],
    ['no-extension'],
    [''],
  ])('rejects invalid key %s', async (badKey) => {
    await expect(storage.put(badKey, Buffer.from([1]), 'image/png')).rejects.toBeInstanceOf(
      StorageError,
    );
  });

  it('constructor rejects relative root', () => {
    expect(() => new LocalFsStorage('relative/path')).toThrow(StorageError);
  });
});
