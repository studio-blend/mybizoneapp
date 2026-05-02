import { describe, expect, it } from 'vitest';
import { rateLimit } from '../../lib/rate-limit';

describe('rateLimit', () => {
  it('lets through up to limit', () => {
    const key = `t-${Math.random()}`;
    expect(rateLimit(key, 3, 1000)).toBe(true);
    expect(rateLimit(key, 3, 1000)).toBe(true);
    expect(rateLimit(key, 3, 1000)).toBe(true);
    expect(rateLimit(key, 3, 1000)).toBe(false);
  });

  it('separate keys are independent', () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(rateLimit(a, 1, 1000)).toBe(true);
    expect(rateLimit(b, 1, 1000)).toBe(true);
    expect(rateLimit(a, 1, 1000)).toBe(false);
    expect(rateLimit(b, 1, 1000)).toBe(false);
  });
});
