'use server';

import { db } from '@/lib/db';
import { type ActionResult, safeAction } from '@/lib/server-action';
import { requireUser } from '@/lib/session';
import { uploadFile } from '@/lib/storage';
import { auditLogs, bumpUsage, businesses, products } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { isValidUnit } from '@mybizone/domain/catalog';
import { type Plan, checkLimit, isValidPlan } from '@mybizone/domain/plans';
import { and, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);
// NUMERIC values arrive from forms as strings; we keep them as strings to round-trip
// through Postgres NUMERIC without float coercion, but we still validate the shape.
const numericText = (precision: number, scale: number) =>
  z.string().regex(new RegExp(`^\\d{1,${precision - scale}}(?:\\.\\d{1,${scale}})?$`), {
    message: `expected number with up to ${scale} decimals`,
  });

const ProductBase = z.object({
  name: z.string().min(1, 'name required').max(200),
  sku: optionalText(60),
  barcode: optionalText(60),
  description: optionalText(2000),
  storeId: uuid,
  categoryId: optionalUuid,
  brandId: optionalUuid,
  unitType: z.string().min(1).max(20),
  unitSymbol: z.string().min(1).max(20),
  price: numericText(10, 2),
  costPrice: z
    .union([z.literal(''), numericText(10, 2)])
    .transform((v) => (v === '' ? null : v)),
  mrp: z.union([z.literal(''), z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/)]).transform((v) => v === '' ? null : v),
  wholesalePrice: z.union([z.literal(''), z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/)]).transform((v) => v === '' ? null : v),
  rate1: z.union([z.literal(''), z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/)]).transform((v) => v === '' ? null : v),
  rate2: z.union([z.literal(''), z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/)]).transform((v) => v === '' ? null : v),
  rate3: z.union([z.literal(''), z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/)]).transform((v) => v === '' ? null : v),
  rate4: z.union([z.literal(''), z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/)]).transform((v) => v === '' ? null : v),
  minStock: z.union([z.literal(''), z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/)]).transform((v) => v === '' ? null : v),
  inventory: numericText(12, 3),
  hsnCode: optionalText(20),
  gstRate: z.union([z.literal(''), numericText(5, 2)]).transform((v) => (v === '' ? null : v)),
});

interface UnitPair {
  unitType: string;
  unitSymbol: string;
}
const unitMatches = (v: UnitPair) => isValidUnit(v.unitType, v.unitSymbol);
const unitErrorPath = { path: ['unitSymbol'], message: 'unit symbol does not match unit type' };

const ProductInput = ProductBase.refine(unitMatches, unitErrorPath);

export const createProductAction = safeAction(ProductInput, async (input, { user, tx }) => {
  const [bizRows, countRows] = await Promise.all([
    tx.select({ plan: businesses.plan }).from(businesses).where(eq(businesses.id, user.businessId)),
    tx
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true))),
  ]);
  const plan: Plan = isValidPlan(bizRows[0]?.plan) ? (bizRows[0].plan as Plan) : 'free';
  const gate = checkLimit(plan, 'products', countRows[0]?.n ?? 0);
  if (!gate.allowed) {
    throw new Error(
      `upgrade required: product limit of ${gate.limit} reached on the free plan`,
    );
  }

  const [row] = await tx
    .insert(products)
    .values({
      businessId: user.businessId,
      storeId: input.storeId,
      categoryId: input.categoryId,
      brandId: input.brandId,
      name: input.name,
      sku: input.sku,
      barcode: input.barcode,
      description: input.description,
      unitType: input.unitType,
      unitSymbol: input.unitSymbol,
      price: input.price,
      costPrice: input.costPrice,
      mrp: input.mrp,
      wholesalePrice: input.wholesalePrice,
      rate1: input.rate1,
      rate2: input.rate2,
      rate3: input.rate3,
      rate4: input.rate4,
      minStock: input.minStock,
      inventory: input.inventory,
      hsnCode: input.hsnCode,
      gstRate: input.gstRate,
    })
    .returning({ id: products.id, name: products.name });
  if (!row) throw new Error('insert failed');

  await Promise.all([
    tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'product.create',
      entity: 'product',
      entityId: row.id,
      after: { name: row.name, price: input.price, inventory: input.inventory },
    }),
    bumpUsage(user.businessId, tx, { productCount: 1 }),
  ]);

  revalidatePath('/products');
  return { id: row.id, name: row.name };
});

const UpdateProductInput = ProductBase.extend({ id: uuid }).refine(unitMatches, unitErrorPath);

export const updateProductAction = safeAction(UpdateProductInput, async (input, { user, tx }) => {
  const [before] = await tx
    .select({ name: products.name, price: products.price })
    .from(products)
    .where(and(eq(products.id, input.id), eq(products.businessId, user.businessId)));
  if (!before) throw new Error('not found');

  const [row] = await tx
    .update(products)
    .set({
      storeId: input.storeId,
      categoryId: input.categoryId,
      brandId: input.brandId,
      name: input.name,
      sku: input.sku,
      barcode: input.barcode,
      description: input.description,
      unitType: input.unitType,
      unitSymbol: input.unitSymbol,
      price: input.price,
      costPrice: input.costPrice,
      mrp: input.mrp,
      wholesalePrice: input.wholesalePrice,
      rate1: input.rate1,
      rate2: input.rate2,
      rate3: input.rate3,
      rate4: input.rate4,
      minStock: input.minStock,
      inventory: input.inventory,
      hsnCode: input.hsnCode,
      gstRate: input.gstRate,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, input.id), eq(products.businessId, user.businessId)))
    .returning({ id: products.id, name: products.name });
  if (!row) throw new Error('update failed');

  // Surface a price-change audit entry separately because pricing is privileged.
  if (before.price !== input.price) {
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'product.price_change',
      entity: 'product',
      entityId: row.id,
      before: { price: before.price },
      after: { price: input.price },
    });
  }
  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'product.update',
    entity: 'product',
    entityId: row.id,
    before,
    after: { name: row.name, price: input.price },
  });

  revalidatePath('/products');
  revalidatePath(`/products/${row.id}/edit`);
  return { id: row.id, name: row.name };
});

const DeleteProductInput = z.object({ id: uuid });

export const deleteProductAction = safeAction(DeleteProductInput, async (input, { user, tx }) => {
  const [before] = await tx
    .select({ name: products.name, active: products.active })
    .from(products)
    .where(and(eq(products.id, input.id), eq(products.businessId, user.businessId)));
  if (!before) throw new Error('not found');

  // Soft-delete via active=false so historical sale_items can still join.
  await tx
    .update(products)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(products.id, input.id), eq(products.businessId, user.businessId)));

  await Promise.all([
    tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'product.delete',
      entity: 'product',
      entityId: input.id,
      before,
      after: { active: false },
    }),
    bumpUsage(user.businessId, tx, { productCount: -1 }),
  ]);

  revalidatePath('/products');
  return { ok: true };
});

/**
 * Upload a product image. Accepts FormData directly (Next.js native pattern)
 * because Server Actions can't carry binary through the safeAction Zod parse.
 *
 * Steps: validate magic bytes + size → write to storage → set image_key on row.
 */
export async function uploadProductImageAction(
  formData: FormData,
): Promise<ActionResult<{ key: string }>> {
  const user = await requireUser();
  const idValue = formData.get('id');
  const fileValue = formData.get('file');
  if (typeof idValue !== 'string' || !/^[0-9a-f-]{36}$/i.test(idValue)) {
    return { ok: false, error: 'invalid product id' };
  }
  if (!(fileValue instanceof Blob) || fileValue.size === 0) {
    return { ok: false, error: 'no file selected' };
  }

  const buf = Buffer.from(await fileValue.arrayBuffer());
  let key: string;
  try {
    const out = await uploadFile({
      category: 'products',
      businessId: user.businessId,
      body: buf,
    });
    key = out.key;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'upload failed' };
  }

  await withTenant(db, user.businessId, async (tx) => {
    await tx
      .update(products)
      .set({ imageKey: key, updatedAt: new Date() })
      .where(and(eq(products.id, idValue), eq(products.businessId, user.businessId)));
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'product.image_upload',
      entity: 'product',
      entityId: idValue,
      after: { imageKey: key },
    });
  });

  revalidatePath('/products');
  revalidatePath(`/products/${idValue}/edit`);
  return { ok: true, data: { key } };
}
