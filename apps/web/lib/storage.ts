import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { type AllowedMime, createStorage, validateUpload } from '@mybizone/storage';
import { env } from './env';

// Resolve relative STORAGE_DIR against repo cwd so a clean .env.example value
// (`./storage`) works without forcing every dev to write an absolute path.
const storageDir =
  env.STORAGE_BACKEND === 'local' ? resolve(process.cwd(), env.STORAGE_DIR) : undefined;

export const storage = createStorage({
  STORAGE_BACKEND: env.STORAGE_BACKEND,
  STORAGE_DIR: storageDir,
  R2_BUCKET: env.R2_BUCKET || undefined,
});

export type UploadCategory = 'products' | 'brands' | 'bills' | 'catalogues' | 'invoices';

const IMAGE_MIMES: ReadonlyArray<AllowedMime> = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_OR_PDF_MIMES: ReadonlyArray<AllowedMime> = [...IMAGE_MIMES, 'application/pdf'];

interface UploadInput {
  category: UploadCategory;
  businessId: string;
  body: Buffer;
  /** Override mime allowlist; defaults to images-only except for catalogues, bills, invoices. */
  allowed?: ReadonlyArray<AllowedMime>;
  maxBytes?: number;
}

/**
 * Validate + persist a tenant-scoped upload. Returns the storage key the caller
 * should persist on the owning row (e.g. products.image_key).
 *
 * Key shape: `<category>/<businessId>/<uuid>.<ext>` — the businessId segment is
 * what the GET route checks against the requesting session.
 */
export async function uploadFile(input: UploadInput): Promise<{ key: string; mime: AllowedMime }> {
  const allowed =
    input.allowed ??
    (input.category === 'bills' || input.category === 'catalogues' || input.category === 'invoices'
      ? IMAGE_OR_PDF_MIMES
      : IMAGE_MIMES);
  const { mime, ext } = validateUpload(input.body, { allowed, maxBytes: input.maxBytes });
  const id = randomUUID();
  const key = `${input.category}/${input.businessId}/${id}.${ext}`;
  await storage.put(key, input.body, mime);
  return { key, mime };
}
