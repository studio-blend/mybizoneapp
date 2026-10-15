import { BUSINESS_PROFILES, effectiveProfile } from '@/lib/business-profile';
import {
  BusinessProfileSettingsSchema,
  StoreProfileSettingsSchema,
} from '@/lib/business-profile-schema';
import { describe, expect, it } from 'vitest';
describe('business profiles', () => {
  it('inherits each setting independently and supports mixed retail/wholesale', () => {
    expect(
      effectiveProfile(
        { businessProfile: 'grocery', sellingModel: 'both' },
        { businessProfile: 'furniture', sellingModel: null },
      ),
    ).toEqual({ businessProfile: 'furniture', sellingModel: 'both' });
    expect(
      effectiveProfile(
        { businessProfile: 'electronics', sellingModel: 'retail' },
        { businessProfile: null, sellingModel: 'wholesale' },
      ),
    ).toEqual({ businessProfile: 'electronics', sellingModel: 'wholesale' });
  });
  it('rejects unknown settings and allows explicit store inheritance', () => {
    expect(
      BusinessProfileSettingsSchema.safeParse({
        businessProfile: 'made-up',
        sellingModel: 'retail',
      }).success,
    ).toBe(false);
    expect(
      StoreProfileSettingsSchema.safeParse({
        storeId: '3d12741d-5521-4d21-9807-18e3da30c869',
        businessProfile: null,
        sellingModel: null,
      }).success,
    ).toBe(true);
    expect(effectiveProfile({ businessProfile: '__proto__', sellingModel: 'constructor' })).toEqual(
      { businessProfile: 'general_retail', sellingModel: 'retail' },
    );
  });
  it('uses shorter review windows for perishables than durable goods', () => {
    expect(BUSINESS_PROFILES.grocery.slowDays).toBeLessThan(BUSINESS_PROFILES.electronics.slowDays);
    expect(BUSINESS_PROFILES.electronics.slowDays).toBeLessThan(
      BUSINESS_PROFILES.furniture.slowDays,
    );
  });
});
