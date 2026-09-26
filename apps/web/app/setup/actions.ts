'use server';

import { db } from '@/lib/db';
import { verifyLicenseKey } from '@mybizone/auth-config/license';
import { account, businesses, stores, user } from '@mybizone/db';
import { generateRandomString, hashPassword } from 'better-auth/crypto';
import { count, sql } from 'drizzle-orm';
import { z } from 'zod/v3';

// DO NOT use withTenant here — no business exists yet during initial setup.

export async function completeSetupAction(data: {
  businessName: string;
  gstin?: string;
  city?: string;
  phone?: string;
  storeName: string;
  storeAddress?: string;
  storeType: 'retail' | 'wholesale' | 'both';
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  licenseKey?: string;
}): Promise<{ success?: boolean; error?: string }> {
  if (process.env.LAN_MODE !== 'true') return { error: 'Setup is available only in LAN mode' };
  const parsed = z
    .object({
      businessName: z.string().trim().min(1).max(120),
      gstin: z.string().trim().max(20).optional(),
      storeName: z.string().trim().min(1).max(120),
      storeAddress: z.string().max(500).optional(),
      adminName: z.string().trim().min(1).max(100),
      adminEmail: z.string().trim().email().toLowerCase(),
      adminPassword: z.string().min(8).max(128),
    })
    .safeParse(data);
  if (!parsed.success)
    return { error: 'Invalid setup details: use a valid email and a password of 8–128 characters' };
  const input = parsed.data;
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1933003)`);
      // 1. Guard: setup must not already be done
      const [bizRow] = await tx.select({ n: count() }).from(businesses);
      if ((bizRow?.n ?? 0) > 0) {
        return { error: 'Setup already completed' };
      }

      // 2. Create business (direct insert — no RLS needed for initial setup)
      const [biz] = await tx
        .insert(businesses)
        .values({
          name: input.businessName,
          vertical: 'retail',
          gstin: input.gstin || null,
          gstEnabled: Boolean(input.gstin),
          plan: 'free',
        })
        .returning();

      if (!biz) return { error: 'Failed to create business' };

      // 3. Create store linked to business
      await tx.insert(stores).values({
        businessId: biz.id,
        name: input.storeName,
        address: input.storeAddress ?? null,
      });

      // 4. Create admin user — hash password using Better Auth's own hasher
      //    so the account row is compatible with Better Auth's email+password flow.
      const hashedPwd = await hashPassword(input.adminPassword);
      const userId = generateRandomString(32, 'a-z', 'A-Z', '0-9');
      const now = new Date();

      await tx.insert(user).values({
        id: userId,
        name: input.adminName,
        email: input.adminEmail,
        emailVerified: true, // LAN setup — skip email verification
        businessId: biz.id,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      });

      // Insert the credential account row (Better Auth email+password provider)
      await tx.insert(account).values({
        id: generateRandomString(32, 'a-z', 'A-Z', '0-9'),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: hashedPwd,
        createdAt: now,
        updatedAt: now,
      });

      return { success: true };
    });
  } catch (err) {
    console.error('[setup] completeSetupAction error:', err);
    return { error: err instanceof Error ? err.message : 'Setup failed' };
  }
}

export async function validateLicenseSetupAction(
  licenseKey: string,
): Promise<{ valid: boolean; plan?: string; error?: string }> {
  try {
    const result = verifyLicenseKey(licenseKey);
    if (result.valid) {
      return { valid: true, plan: result.payload.plan };
    }
    return { valid: false, error: result.reason };
  } catch {
    return { valid: false, error: 'License verification failed' };
  }
}
