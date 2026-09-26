import { describe, expect, it } from 'vitest';
import { calculateReturnLines } from '../src/returns';

const source = [{ productId: 'p', qty: '3', lineTotal: '100.00', gstAmount: '15.25' }];
describe('invoice-linked returns', () => {
  it('preserves original discounts and GST across partial returns including the final paisa', () => {
    const first = calculateReturnLines(source, [], [{ productId: 'p', qty: '1' }]);
    const second = calculateReturnLines(source, first, [{ productId: 'p', qty: '1' }]);
    const third = calculateReturnLines(
      source,
      [...first, ...second],
      [{ productId: 'p', qty: '1' }],
    );
    expect(first[0]?.lineTotal).toBe('33.33');
    expect(second[0]?.lineTotal).toBe('33.34');
    expect(third[0]?.lineTotal).toBe('33.33');
    expect(
      [...first, ...second, ...third].reduce(
        (n, line) => n + Math.round(Number(line.gstAmount) * 100),
        0,
      ),
    ).toBe(1525);
  });
  it('rejects quantities exceeding remaining original quantity', () => {
    const previous = [{ productId: 'p', qty: '2', lineTotal: '66.67', gstAmount: '10.17' }];
    expect(() =>
      calculateReturnLines(source, previous, [{ productId: 'p', qty: '1.001' }]),
    ).toThrow('exceeds');
  });
  it('rejects duplicate requested products, unrelated products and zero quantities', () => {
    expect(() =>
      calculateReturnLines(
        source,
        [],
        [
          { productId: 'p', qty: '1' },
          { productId: 'p', qty: '1' },
        ],
      ),
    ).toThrow('duplicate');
    expect(() => calculateReturnLines(source, [], [{ productId: 'other', qty: '1' }])).toThrow(
      'original bill',
    );
    expect(() => calculateReturnLines(source, [], [{ productId: 'p', qty: '0' }])).toThrow(
      'positive',
    );
  });
  it('keeps free-item refunds at zero', () => {
    expect(
      calculateReturnLines(
        [{ productId: 'p', qty: '1', lineTotal: '0', gstAmount: '0' }],
        [],
        [{ productId: 'p', qty: '1' }],
      )[0]?.lineTotal,
    ).toBe('0.00');
  });
  it('aggregates multiple original lines and fractional quantities', () => {
    const original = [
      { productId: 'p', qty: '0.125', lineTotal: '10', gstAmount: '0' },
      { productId: 'p', qty: '0.125', lineTotal: '20', gstAmount: '0' },
    ];
    expect(
      calculateReturnLines(original, [], [{ productId: 'p', qty: '0.125' }])[0]?.lineTotal,
    ).toBe('15.00');
  });
  it('requires reconciliation of historically overvalued returns', () => {
    expect(() =>
      calculateReturnLines(
        source,
        [{ productId: 'p', qty: '1', lineTotal: '110', gstAmount: '0' }],
        [{ productId: 'p', qty: '1' }],
      ),
    ).toThrow('reconciliation');
  });
});
