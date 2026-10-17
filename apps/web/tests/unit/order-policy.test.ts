import { centsText, deliveredShare, moneyCents, orderFulfilment } from '@/lib/order-policy';
import { describe, expect, it } from 'vitest';
describe('order money and cumulative deliveries', () => {
  it('keeps exact signed cents and rejects unsupported precision', () => {
    expect(moneyCents('123.40')).toBe(12340);
    expect(moneyCents('-0.01')).toBe(-1);
    expect(centsText(-12340)).toBe('-123.40');
    for (const n of ['1.001', 'NaN', '1e3', '99999999999']) expect(() => moneyCents(n)).toThrow();
    expect(() => centsText(1.1)).toThrow();
  });
  it('allocates every cent across arbitrary partial handovers', () => {
    expect(['0', '1', '2'].map((delivered) => deliveredShare('0.02', '3', delivered, '1'))).toEqual(
      ['0.01', '0.00', '0.01'],
    );
    expect(deliveredShare('118.01', '1.000', '0.333', '0.667')).toBe('78.71');
    expect(() => deliveredShare('10', '3', '2', '2')).toThrow();
    expect(() => deliveredShare('10', '3', '0', '0')).toThrow();
    expect(deliveredShare('9999999999.99', '999999999.999', '0', '999999999.999')).toBe(
      '9999999999.99',
    );
  });
  it('distinguishes delivery progress from remainder cancellation', () => {
    expect(orderFulfilment('open', 3, 0)).toBe('Awaiting delivery');
    expect(orderFulfilment('open', 3, 1)).toBe('Part delivered');
    expect(orderFulfilment('open', 3, 3)).toBe('Delivered');
    expect(orderFulfilment('cancelled', 3, 1)).toBe('Cancelled remainder');
  });
});
