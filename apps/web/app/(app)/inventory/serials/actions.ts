'use server';

import { requirePermission } from '@/lib/require-permission';
import { serialCodes, serialCount } from '@/lib/serial-policy';
import { safeAction } from '@/lib/server-action';
import { lockedStockProduct } from '@/lib/stock-batches';
import { auditLogs, products, stockSerialEvents, stockSerials } from '@mybizone/db';
import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const term = {
  warrantyMonths: z.number().int().min(0).max(120),
  warrantyIssuer: z.string().trim().max(120).default(''),
};
export const enableSerialTrackingAction = safeAction(
  z.object({
    productId: z.string().uuid(),
    serialNumbers: z.array(z.string().max(100)).max(500),
    ...term,
  }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_inventory');
    const product = await lockedStockProduct(tx, user.businessId, input.productId);
    if (!product.active || product.serialTracking)
      throw new Error('Choose an active product that is not already serial-tracked');
    if (product.batchTracking) throw new Error('A product uses either batch or serial tracking');
    if (product.unitType !== 'piece' || product.unitSymbol !== 'pc')
      throw new Error('Serial tracking requires pieces (pc)');
    const codes = serialCodes(input.serialNumbers);
    if (codes.length !== serialCount(product.inventory))
      throw new Error('Opening serials must exactly match current physical stock');
    if (input.warrantyMonths && !input.warrantyIssuer)
      throw new Error('Enter the issuer whose warranty terms you are recording');
    if (codes.length) {
      const found = await tx
        .select({ code: stockSerials.code })
        .from(stockSerials)
        .where(
          and(eq(stockSerials.businessId, user.businessId), inArray(stockSerials.code, codes)),
        );
      if (found.length)
        throw new Error('One or more serials are already registered in this business');
      const units = await tx
        .insert(stockSerials)
        .values(
          codes.map((code) => ({
            businessId: user.businessId,
            productId: product.id,
            code,
            state: 'available',
          })),
        )
        .returning({ id: stockSerials.id });
      await tx.insert(stockSerialEvents).values(
        units.map((unit) => ({
          businessId: user.businessId,
          serialId: unit.id,
          kind: 'opening',
          documentId: product.id,
        })),
      );
    }
    await tx
      .update(products)
      .set({
        serialTracking: true,
        serialTrackingSince: new Date(),
        warrantyMonths: input.warrantyMonths,
        warrantyIssuer: input.warrantyMonths ? input.warrantyIssuer : null,
        updatedAt: new Date(),
      })
      .where(eq(products.id, product.id));
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'serial.enable',
      entity: 'product',
      entityId: product.id,
      before: { serialTracking: false, inventory: product.inventory },
      after: {
        serialTracking: true,
        inventory: product.inventory,
        serialNumbers: codes,
        warrantyMonths: input.warrantyMonths,
        warrantyIssuer: input.warrantyIssuer,
      },
    });
    revalidatePath('/inventory/serials');
    revalidatePath('/products');
    revalidatePath('/sales/new');
    return { id: product.id };
  },
);

export const configureWarrantyAction = safeAction(
  z.object({ productId: z.string().uuid(), ...term }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_inventory');
    const product = await lockedStockProduct(tx, user.businessId, input.productId);
    if (!product.active || !product.serialTracking)
      throw new Error('Choose an active serial-tracked product');
    if (input.warrantyMonths && !input.warrantyIssuer)
      throw new Error('Enter the issuer whose warranty terms you are recording');
    const after = {
      warrantyMonths: input.warrantyMonths,
      warrantyIssuer: input.warrantyMonths ? input.warrantyIssuer : null,
    };
    await tx
      .update(products)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(products.id, product.id));
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'serial.warranty_terms',
      entity: 'product',
      entityId: product.id,
      before: { warrantyMonths: product.warrantyMonths, warrantyIssuer: product.warrantyIssuer },
      after,
    });
    revalidatePath('/inventory/serials');
    return { id: product.id };
  },
);

export const reviewSerialAction = safeAction(
  z.object({
    serialId: z.string().uuid(),
    decision: z.enum(['hold', 'release']),
    note: z.string().trim().min(3).max(500),
  }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_inventory');
    const [lookup] = await tx
      .select({ productId: stockSerials.productId })
      .from(stockSerials)
      .where(
        and(eq(stockSerials.id, input.serialId), eq(stockSerials.businessId, user.businessId)),
      );
    if (!lookup) throw new Error('Serial not found');
    const product = await lockedStockProduct(tx, user.businessId, lookup.productId);
    if (!product.active || !product.serialTracking)
      throw new Error('Active serial-tracked product required');
    const [before] = await tx
      .select()
      .from(stockSerials)
      .where(and(eq(stockSerials.id, input.serialId), eq(stockSerials.businessId, user.businessId)))
      .for('update');
    const expected = input.decision === 'hold' ? 'available' : 'quarantine';
    if (!before || before.state !== expected)
      throw new Error('This serial is no longer in the state you are reviewing');
    const state = input.decision === 'hold' ? 'quarantine' : 'available';
    await tx.update(stockSerials).set({ state }).where(eq(stockSerials.id, before.id));
    await tx.insert(stockSerialEvents).values({
      businessId: user.businessId,
      serialId: before.id,
      kind: input.decision,
      documentId: before.id,
    });
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: `serial.${input.decision}`,
      entity: 'stock_serial',
      entityId: before.id,
      before: { state: before.state },
      after: { state, note: input.note },
    });
    revalidatePath('/inventory/serials');
    revalidatePath('/sales/new');
    return { id: before.id };
  },
);
