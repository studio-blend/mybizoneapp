'use server';

import { db } from '@/lib/db';
import { businesses, stores, user, account } from '@mybizone/db';
import { count } from 'drizzle-orm';
import { hashPassword, generateRandomString } from 'better-auth/crypto';
import { verifyLicenseKey } from '@mybizone/auth-config/license';

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
  try {
    // 1. Guard: setup must not already be done
    const [bizRow] = await db.select({ n: count() }).from(businesses);
    if ((bizRow?.n ?? 0) > 0) {
      return { error: 'Setup already completed' };
    }

    // 2. Create business (direct insert — no RLS needed for initial setup)
    const [biz] = await db
      .insert(businesses)
      .values({
        name: data.businessName,
        vertical: 'retail',
        gstin: data.gstin ?? null,
        gstEnabled: Boolean(data.gstin),
        plan: 'free',
      })
      .returning();

    if (!biz) return { error: 'Failed to create business' };

    // 3. Create store linked to business
    await db.insert(stores).values({
      businessId: biz.id,
      name: data.storeName,
      address: data.storeAddress ?? null,
    });

    // 4. Create admin user — hash password using Better Auth's own hasher
    //    so the account row is compatible with Better Auth's email+password flow.
    const hashedPwd = await hashPassword(data.adminPassword);
    const userId = generateRandomString(32, 'a-z', 'A-Z', '0-9');
    const now = new Date();

    await db.insert(user).values({
      id: userId,
      name: data.adminName,
      email: data.adminEmail,
      emailVerified: true, // LAN setup — skip email verification
      businessId: biz.id,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Insert the credential account row (Better Auth email+password provider)
    await db.insert(account).values({
      id: generateRandomString(32, 'a-z', 'A-Z', '0-9'),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashedPwd,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true };
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
