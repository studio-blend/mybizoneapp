import { type Storage, StorageError } from './types';

/**
 * Stub R2 backend. M2 ships LocalFs only — R2 wiring lands in M3 alongside
 * the SaaS hosting cutover. Throwing rather than returning a soft fallback is
 * deliberate: a misconfigured prod env should fail at startup, not silently
 * write nowhere.
 */
export class R2Storage implements Storage {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: kept so the M3 wiring lands without an interface change.
  private readonly bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  put(): Promise<{ key: string }> {
    return Promise.reject(unconfigured());
  }
  get(): Promise<Buffer> {
    return Promise.reject(unconfigured());
  }
  delete(): Promise<void> {
    return Promise.reject(unconfigured());
  }
  exists(): Promise<boolean> {
    return Promise.reject(unconfigured());
  }
}

function unconfigured(): StorageError {
  return new StorageError(
    'R2 backend not wired in M2. Set STORAGE_BACKEND=local for self-host, or wire credentials in M3.',
    'not_configured',
  );
}
