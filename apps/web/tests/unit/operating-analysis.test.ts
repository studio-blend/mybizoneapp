import { dashboardUrl } from '@/lib/dashboard-queries';
import { analysisSlot } from '@/lib/operating-analysis';
import { describe, expect, it } from 'vitest';
describe('operating-analysis selections', () => {
  it('supports midnight, independent filters and clearing the time selection', () => {
    expect(analysisSlot({ weekday: '1', hour: '0' })).toEqual({ weekday: 1, hour: 0 });
    expect(analysisSlot({ hour: '23' })).toEqual({ weekday: null, hour: 23 });
    expect(analysisSlot({ weekday: '', hour: '' })).toEqual({ weekday: null, hour: null });
  });
  it('rejects malformed time selections instead of silently widening them', () => {
    for (const hour of ['24', '-1', '1.5', '1 OR 1=1'])
      expect(() => analysisSlot({ hour })).toThrow(/valid weekday and hour/);
    for (const weekday of ['0', '8', 'NaN']) expect(() => analysisSlot({ weekday })).toThrow();
  });
  it('preserves the workspace scope when moving between dashboard and analysis', () => {
    const selection = {
      view: 'operations',
      range: 'week',
      storeId: 'store A',
      departmentId: 'dept/1',
    };
    const url = new URL(dashboardUrl(selection, true), 'https://example.invalid');
    expect(url.pathname).toBe('/dashboard/analysis');
    expect(Object.fromEntries(url.searchParams)).toEqual(selection);
  });
});
