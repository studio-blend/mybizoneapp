import { convertPack, handoverPack, packDescription } from '@/lib/pack-policy';
import { creditDueDate, customerPrice } from '@/lib/wholesale-policy';
import { describe, expect, it } from 'vitest';
const carton = { name: 'Carton', qtyPerPack: '12', unitType: 'piece', unitSymbol: 'pc' };
describe('wholesale conversion, prices and credit dates', () => {
  it('converts packs plus loose stock exactly without changing the pricing unit', () => {
    const result = convertPack(carton, '2', '3');
    expect(result.qty).toBe('27.000');
    expect(packDescription(result.packSnapshot)).toContain('2 × Carton');
    expect(handoverPack(result.packSnapshot, '15')).toMatchObject({ packs: '1', loose: '3.000' });
    expect(
      convertPack(
        { ...carton, qtyPerPack: '0.125', unitType: 'weight', unitSymbol: 'kg' },
        '3',
        '0.001',
      ).qty,
    ).toBe('0.376');
  });
  it('rejects fractional pack counts, fractional pieces, empty quantities and overflow', () => {
    for (const [count, loose] of [
      ['1.5', '0'],
      ['0', '0'],
      ['1', '0.5'],
      ['999999999', '0'],
    ] as const)
      expect(() => convertPack(carton, count, loose)).toThrow();
    expect(() => convertPack({ ...carton, qtyPerPack: '1.5' }, '1')).toThrow();
  });
  it('uses configured customer tiers including zero rates and explicit fallback', () => {
    const tiers = { price: '10', wholesalePrice: '8', mrp: '12', rate1: '7', rate2: '0' };
    expect(customerPrice(tiers, 'wholesale')).toBe('8');
    expect(customerPrice(tiers, 'dealer')).toBe('7');
    expect(customerPrice(tiers, 'rate2')).toBe('0');
    expect(customerPrice(tiers, 'rate4')).toBe('10');
  });
  it('starts credit days on the India billing date, including leap and year boundaries', () => {
    expect(creditDueDate(1, '2028-02-28')).toBe('2028-02-29');
    expect(creditDueDate(30, '2026-12-15')).toBe('2027-01-14');
    expect(creditDueDate(0, '2026-10-17')).toBe('2026-10-17');
    expect(() => creditDueDate(366)).toThrow();
  });
});
