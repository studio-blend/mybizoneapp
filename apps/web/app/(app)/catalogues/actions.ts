'use server';

import { db } from '@/lib/db';
import { type ActionResult, safeAction } from '@/lib/server-action';
import { requireUser } from '@/lib/session';
import { uploadFile } from '@/lib/storage';
import { auditLogs, catalogues } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));

/**
 * Upload a catalogue file + insert the row in one shot.
 * Uses FormData (not safeAction) because Server Actions can't carry binary through Zod JSON parse.
 */
export async function createCatalogueAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; name: string }>> {
  const user = await requireUser();

  const name = (formData.get('name') as string | null)?.trim();
  const brandIdRaw = (formData.get('brandId') as string | null) ?? '';
  const storeIdRaw = (formData.get('storeId') as string | null) ?? '';
  const fileValue = formData.get('file');

  if (!name || name.length === 0) return { ok: false, error: 'name required' };
  if (name.length > 200) return { ok: false, error: 'name too long' };
  if (!(fileValue instanceof Blob) || fileValue.size === 0) {
    return { ok: false, error: 'no file selected' };
  }
  if (fileValue.size > 20 * 1024 * 1024) {
    return { ok: false, error: 'file too large (max 20 MB)' };
  }

  const brandId = brandIdRaw && /^[0-9a-f-]{36}$/i.test(brandIdRaw) ? brandIdRaw : null;
  const storeId = storeIdRaw && /^[0-9a-f-]{36}$/i.test(storeIdRaw) ? storeIdRaw : null;

  const buf = Buffer.from(await fileValue.arrayBuffer());
  let fileKey: string;
  try {
    const out = await uploadFile({
      category: 'catalogues',
      businessId: user.businessId,
      body: buf,
    });
    fileKey = out.key;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'upload failed' };
  }

  try {
    const [row] = await withTenant(db, user.businessId, async (tx) => {
      const inserted = await tx
        .insert(catalogues)
        .values({
          businessId: user.businessId,
          name,
          fileKey,
          brandId,
          storeId,
          uploadedByUserId: user.id,
        })
        .returning({ id: catalogues.id, name: catalogues.name });

      await tx.insert(auditLogs).values({
        businessId: user.businessId,
        actorId: user.id,
        action: 'catalogue.create',
        entity: 'catalogue',
        entityId: inserted[0]?.id ?? '',
        after: { name },
      });

      return inserted;
    });

    if (!row) return { ok: false, error: 'insert failed' };

    revalidatePath('/catalogues');
    return { ok: true, data: { id: row.id, name: row.name } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'server error' };
  }
}

const DeleteInput = z.object({ id: uuid });

export const deleteCatalogueAction = safeAction(DeleteInput, async (input, { user, tx }) => {
  const [before] = await tx
    .select({ name: catalogues.name })
    .from(catalogues)
    .where(and(eq(catalogues.id, input.id), eq(catalogues.businessId, user.businessId)));
  if (!before) throw new Error('not found');

  await tx
    .delete(catalogues)
    .where(and(eq(catalogues.id, input.id), eq(catalogues.businessId, user.businessId)));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'catalogue.delete',
    entity: 'catalogue',
    entityId: input.id,
    before,
  });

  revalidatePath('/catalogues');
  return { ok: true };
});
