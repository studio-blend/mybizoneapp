export const BUSINESS_PROFILES = {
  general_retail: {
    label: 'General retail / utensils',
    focus: 'Product profitability, basket value and stock replenishment.',
    slowDays: 30,
    priority: 'profit',
  },
  grocery: {
    label: 'Grocery',
    focus: 'Stock availability, fast replenishment and products with no recent sales.',
    slowDays: 14,
    priority: 'stock',
  },
  furniture: {
    label: 'Furniture',
    focus: 'Stock investment, product margins and customer collections.',
    slowDays: 90,
    priority: 'stock',
  },
  electronics: {
    label: 'Electronics',
    focus: 'Product margins, slow models and stock investment.',
    slowDays: 60,
    priority: 'profit',
  },
  wholesale: {
    label: 'Wholesale / distribution',
    focus: 'Customer collections, product margins and stock availability.',
    slowDays: 60,
    priority: 'collections',
  },
  food_service: {
    label: 'Restaurant / café',
    focus:
      'Sales patterns and stock availability. Ingredient and kitchen tracking are planned separately.',
    slowDays: 7,
    priority: 'stock',
  },
} as const;
export type BusinessProfile = keyof typeof BUSINESS_PROFILES;
export const SELLING_MODELS = {
  retail: 'Retail',
  wholesale: 'Wholesale',
  both: 'Retail and wholesale',
} as const;
export type SellingModel = keyof typeof SELLING_MODELS;
export interface ProfileSettings {
  businessProfile: BusinessProfile;
  sellingModel: SellingModel;
}
export function effectiveProfile(
  business: { businessProfile?: string | null; sellingModel?: string | null },
  store?: { businessProfile?: string | null; sellingModel?: string | null },
): ProfileSettings {
  const profile = store?.businessProfile ?? business.businessProfile;
  const model = store?.sellingModel ?? business.sellingModel;
  return {
    businessProfile:
      profile && Object.hasOwn(BUSINESS_PROFILES, profile)
        ? (profile as BusinessProfile)
        : 'general_retail',
    sellingModel:
      model && Object.hasOwn(SELLING_MODELS, model) ? (model as SellingModel) : 'retail',
  };
}
