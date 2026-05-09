import { describe, expect, it } from 'vitest';
import { PLAN_LIMITS, checkLimit, isValidPlan } from '../src/plans';

describe('PLAN_LIMITS', () => {
  it('free tier limits', () => {
    expect(PLAN_LIMITS.free.stores).toBe(1);
    expect(PLAN_LIMITS.free.products).toBe(500);
    expect(PLAN_LIMITS.free.users).toBe(1);
  });

  it('pro tier is unlimited', () => {
    expect(PLAN_LIMITS.pro.stores).toBe(Infinity);
    expect(PLAN_LIMITS.pro.products).toBe(Infinity);
    expect(PLAN_LIMITS.pro.users).toBe(Infinity);
  });
});

describe('checkLimit', () => {
  it('allows when under limit', () => {
    const r = checkLimit('free', 'stores', 0);
    expect(r).toEqual({ allowed: true, current: 0, limit: 1 });
  });

  it('blocks at limit (not strictly over)', () => {
    const r = checkLimit('free', 'stores', 1);
    expect(r.allowed).toBe(false);
    expect(r.current).toBe(1);
    expect(r.limit).toBe(1);
  });

  it('blocks over limit', () => {
    const r = checkLimit('free', 'products', 600);
    expect(r.allowed).toBe(false);
  });

  it('pro always allows', () => {
    expect(checkLimit('pro', 'stores', 9999).allowed).toBe(true);
    expect(checkLimit('pro', 'products', 999999).allowed).toBe(true);
    expect(checkLimit('pro', 'users', 9999).allowed).toBe(true);
  });

  it('boundary: one under limit is allowed', () => {
    expect(checkLimit('free', 'products', 499).allowed).toBe(true);
  });

  it('boundary: exactly at limit is blocked', () => {
    expect(checkLimit('free', 'products', 500).allowed).toBe(false);
  });
});

describe('isValidPlan', () => {
  it('accepts valid plans', () => {
    expect(isValidPlan('free')).toBe(true);
    expect(isValidPlan('pro')).toBe(true);
  });

  it('rejects unknown plans', () => {
    expect(isValidPlan('enterprise')).toBe(false);
    expect(isValidPlan('')).toBe(false);
    expect(isValidPlan(null)).toBe(false);
    expect(isValidPlan(undefined)).toBe(false);
  });
});
