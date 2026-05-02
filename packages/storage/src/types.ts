/**
 * Backend-agnostic blob storage. LocalFs (self-host) and R2 (SaaS) both
 * implement this; same code path either way.
 *
 * Tenant isolation is NOT enforced here — keys must include the business_id
 * segment and the route handler must verify it against the session.
 */
export interface Storage {
  /** Persist `body` under `key`. Caller is responsible for choosing tenant-scoped keys. */
  put(key: string, body: Buffer, mime: string): Promise<{ key: string }>;
  /** Read raw bytes. Throws StorageError when missing. */
  get(key: string): Promise<Buffer>;
  /** Idempotent delete — does not throw when the key is absent. */
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_key' | 'not_found' | 'backend_error' | 'not_configured',
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

// Allowed key shape: <category>/<segment>/.../<filename>.<ext>
//   - segments are slug-safe (a-z, 0-9, dashes, underscores)
//   - exactly one extension on the trailing filename
//   - 2..6 path segments total to prevent absurd nesting / DoS
//   - keeps every byte well-clear of anything path.resolve could escape with
const KEY_RE = /^[a-z][a-z0-9_-]*(?:\/[a-zA-Z0-9_-]+){1,4}\.[a-z0-9]{2,5}$/;

export function isValidKey(key: string): boolean {
  if (key.length > 256) return false;
  if (key.includes('..') || key.includes('//')) return false;
  return KEY_RE.test(key);
}

export function assertValidKey(key: string): void {
  if (!isValidKey(key)) {
    throw new StorageError(`invalid storage key: ${key}`, 'invalid_key');
  }
}
