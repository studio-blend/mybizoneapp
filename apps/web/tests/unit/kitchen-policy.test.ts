import { ingredientValue, kitchenCosts, recipeQuantity } from '@/lib/kitchen-policy';
import { describe, expect, it } from 'vitest';
describe('kitchen stock and cost policy', () => {
  it('scales whole batches without floating-point quantity drift', () => {
    expect(recipeQuantity('0.125', 3, 'weight')).toBe('0.375');
    expect(recipeQuantity('12', 4, 'piece')).toBe('48.000');
  });
  it('rejects fractional batches, fractional pieces and quantity overflow', () => {
    for (const run of [0, 1.5, 10001]) expect(() => recipeQuantity('1', run, 'weight')).toThrow();
    expect(() => recipeQuantity('0.5', 1, 'piece')).toThrow();
    expect(() => recipeQuantity('999999999', 2, 'weight')).toThrow();
  });
  it('rounds ingredient values in cents and derives production and blended cost', () => {
    expect(ingredientValue('0.125', '10.04')).toBe('1.26');
    expect(kitchenCosts([{ qty: '2', cost: '10' }], '4', '2', '6')).toEqual({
      total: '20.00',
      unit: '5.00',
      blended: '5.33',
    });
  });
  it('retains unknown costs instead of manufacturing zero values', () => {
    expect(ingredientValue('2', null)).toBe(null);
    expect(kitchenCosts([{ qty: '1', cost: null }], '1', '0', null)).toEqual({
      total: null,
      unit: null,
      blended: null,
    });
    expect(kitchenCosts([{ qty: '1', cost: '5' }], '1', '1', null)).toEqual({
      total: '5.00',
      unit: '5.00',
      blended: null,
    });
  });
  it('rejects zero yield and cost overflow', () => {
    expect(() => kitchenCosts([{ qty: '1', cost: '5' }], '0', '0', null)).toThrow();
    expect(() => ingredientValue('999999999', '99999999.99')).toThrow();
  });
});
