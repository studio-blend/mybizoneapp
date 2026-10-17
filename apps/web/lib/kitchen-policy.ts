import { centsText, moneyCents } from './order-policy';
import { stockText, stockUnits } from './stock-batch-policy';

const maxStock = 999999999999n;
function divided(n: bigint, d: bigint) {
  if (d <= 0n || n < 0n) throw new Error('Invalid kitchen calculation');
  return (n + d / 2n) / d;
}
export function recipeQuantity(qty: string, runs: number, unitType: string) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 10000)
    throw new Error('Use 1–10000 whole recipe batches');
  const result = BigInt(stockUnits(qty)) * BigInt(runs);
  if (result <= 0n || result > maxStock || (unitType === 'piece' && result % 1000n))
    throw new Error('Recipe quantity exceeds stock precision or requires whole pieces');
  return stockText(Number(result));
}
export function ingredientValue(qty: string, cost: string | null) {
  if (cost === null) return null;
  const cents = divided(BigInt(stockUnits(qty)) * BigInt(moneyCents(cost)), 1000n);
  if (cents > 999999999999n) throw new Error('Ingredient value exceeds supported precision');
  return centsText(Number(cents));
}
export function kitchenCosts(
  lines: { qty: string; cost: string | null }[],
  actual: string,
  previousQty: string,
  previousCost: string | null,
) {
  const qty = BigInt(stockUnits(actual));
  if (!qty)
    throw new Error('Record a positive actual yield; write off failed ingredients as waste');
  const values = lines.map((l) => ingredientValue(l.qty, l.cost));
  if (values.some((v) => v === null)) return { total: null, unit: null, blended: null };
  const total = values.reduce<bigint>((n, v) => n + BigInt(moneyCents(v ?? '0')), 0n);
  if (total > 99999999999999n) throw new Error('Preparation cost exceeds supported precision');
  const unit = divided(total * 1000n, qty);
  const before = BigInt(stockUnits(previousQty));
  const blended =
    before && previousCost === null
      ? null
      : divided(before * BigInt(moneyCents(previousCost ?? '0')) + total * 1000n, before + qty);
  if (unit > 9999999999n || (blended !== null && blended > 9999999999n))
    throw new Error('Prepared unit cost exceeds supported precision');
  return {
    total: centsText(Number(total)),
    unit: centsText(Number(unit)),
    blended: blended === null ? null : centsText(Number(blended)),
  };
}
