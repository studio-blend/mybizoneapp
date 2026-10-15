import { z } from 'zod/v3';
export const BusinessProfileSchema = z.enum([
  'general_retail',
  'grocery',
  'furniture',
  'electronics',
  'wholesale',
  'food_service',
]);
export const SellingModelSchema = z.enum(['retail', 'wholesale', 'both']);
export const BusinessProfileSettingsSchema = z.object({
  businessProfile: BusinessProfileSchema,
  sellingModel: SellingModelSchema,
});
export const StoreProfileSettingsSchema = z.object({
  storeId: z.string().uuid(),
  businessProfile: BusinessProfileSchema.nullable(),
  sellingModel: SellingModelSchema.nullable(),
});
