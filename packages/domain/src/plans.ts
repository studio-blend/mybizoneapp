export type Plan = 'free' | 'pro';
export type LimitResource = 'stores' | 'products' | 'users';

export const PLAN_LIMITS: Record<Plan, Record<LimitResource, number>> = {
  free: { stores: 1, products: 500, users: 1 },
  pro: { stores: Infinity, products: Infinity, users: Infinity },
};

export interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
}

export function checkLimit(
  plan: Plan,
  resource: LimitResource,
  current: number,
): LimitCheck {
  const limit = PLAN_LIMITS[plan][resource];
  return { allowed: current < limit, current, limit };
}

export function isValidPlan(value: unknown): value is Plan {
  return value === 'free' || value === 'pro';
}
