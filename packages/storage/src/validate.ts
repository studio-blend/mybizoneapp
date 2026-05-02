/**
 * Magic-byte + size validation for upload boundaries (Server Actions, API routes).
 * Trust nothing the client claims — sniff the bytes ourselves.
 */
import { StorageError } from './types';

export type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface MagicSignature {
  mime: AllowedMime;
  ext: string;
  // Sequence of byte values the file must start with. `null` is a wildcard.
  bytes: Array<number | null>;
}

const SIGNATURES: MagicSignature[] = [
  { mime: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  {
    mime: 'image/png',
    ext: 'png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  // RIFF....WEBP
  {
    mime: 'image/webp',
    ext: 'webp',
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  { mime: 'application/pdf', ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

export interface SniffResult {
  mime: AllowedMime;
  ext: string;
}

export function sniffMime(body: Buffer): SniffResult | null {
  for (const sig of SIGNATURES) {
    if (body.length < sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      const expected = sig.bytes[i];
      if (expected !== null && body[i] !== expected) {
        match = false;
        break;
      }
    }
    if (match) return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

export interface ValidateUploadOptions {
  maxBytes?: number;
  /** Whitelist of accepted mime types. Defaults to all SIGNATURES entries. */
  allowed?: ReadonlyArray<AllowedMime>;
}

export interface ValidatedUpload {
  mime: AllowedMime;
  ext: string;
  size: number;
}

/**
 * Throws StorageError on size cap exceeded, unrecognized magic bytes, or a
 * mime that's not on the allowlist.
 */
export function validateUpload(body: Buffer, options: ValidateUploadOptions = {}): ValidatedUpload {
  const max = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (body.length === 0) {
    throw new StorageError('empty upload', 'invalid_key');
  }
  if (body.length > max) {
    throw new StorageError(`upload exceeds ${max} bytes (${body.length})`, 'invalid_key');
  }
  const sniff = sniffMime(body);
  if (!sniff) {
    throw new StorageError('unsupported file type (magic-byte check failed)', 'invalid_key');
  }
  if (options.allowed && !options.allowed.includes(sniff.mime)) {
    throw new StorageError(`mime ${sniff.mime} not allowed here`, 'invalid_key');
  }
  return { mime: sniff.mime, ext: sniff.ext, size: body.length };
}
