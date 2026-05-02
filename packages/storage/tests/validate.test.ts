/**
 * Magic-byte sniff + size cap + allowlist enforcement for uploads.
 */
import { describe, expect, it } from 'vitest';
import { StorageError } from '../src/types';
import { sniffMime, validateUpload } from '../src/validate';

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_HEAD = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
const WEBP_HEAD = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);

describe('sniffMime', () => {
  it('detects JPEG', () => expect(sniffMime(JPEG_HEAD)?.mime).toBe('image/jpeg'));
  it('detects PNG', () => expect(sniffMime(PNG_HEAD)?.mime).toBe('image/png'));
  it('detects WebP with wildcard size bytes', () =>
    expect(sniffMime(WEBP_HEAD)?.mime).toBe('image/webp'));
  it('detects PDF', () => expect(sniffMime(PDF_HEAD)?.mime).toBe('application/pdf'));
  it('returns null on plain text', () =>
    expect(sniffMime(Buffer.from('hello world', 'utf8'))).toBeNull());
  it('returns null on a buffer too short for any signature', () =>
    expect(sniffMime(Buffer.from([0xff]))).toBeNull());
});

describe('validateUpload', () => {
  it('accepts a JPEG of normal size', () => {
    const body = Buffer.concat([JPEG_HEAD, Buffer.alloc(1024)]);
    const out = validateUpload(body);
    expect(out.mime).toBe('image/jpeg');
    expect(out.size).toBe(body.length);
  });

  it('rejects empty upload', () => {
    expect(() => validateUpload(Buffer.alloc(0))).toThrow(StorageError);
  });

  it('rejects oversized upload', () => {
    const body = Buffer.concat([JPEG_HEAD, Buffer.alloc(20)]);
    expect(() => validateUpload(body, { maxBytes: 10 })).toThrow(/exceeds/);
  });

  it('rejects unsupported mime (text masquerading as upload)', () => {
    expect(() => validateUpload(Buffer.from('hello world world world', 'utf8'))).toThrow(
      /magic-byte/,
    );
  });

  it('rejects mime not on allowlist', () => {
    const body = Buffer.concat([PDF_HEAD, Buffer.alloc(64)]);
    expect(() => validateUpload(body, { allowed: ['image/jpeg', 'image/png'] })).toThrow(
      /not allowed/,
    );
  });
});
