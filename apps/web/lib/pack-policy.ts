import type { PackSnapshot } from '@mybizone/db';
import { stockText, stockUnits } from './stock-batch-policy';
export interface PackOption {
  id: string;
  productId: string;
  name: string;
  qtyPerPack: string;
  unitType: string;
  unitSymbol: string;
}
export interface PackInput {
  packId?: string;
  packCount?: string;
  looseQty?: string;
  qty: string;
}
export function convertPack(
  pack: Omit<PackOption, 'id' | 'productId'>,
  count: string,
  loose = '0',
) {
  if (!/^\d{1,9}$/.test(count)) throw new Error('Pack count must be a whole number');
  const factor = stockUnits(pack.qtyPerPack);
  const looseUnits = stockUnits(loose);
  const units = BigInt(factor) * BigInt(count) + BigInt(looseUnits);
  if (!factor || units <= 0n || units > 999999999999n)
    throw new Error('Converted quantity exceeds supported stock precision');
  if (pack.unitType === 'piece' && (factor % 1000 || looseUnits % 1000))
    throw new Error('Pieces require whole quantities');
  const qty = stockText(Number(units));
  const snapshot: PackSnapshot = {
    name: pack.name,
    factor: stockText(factor),
    packs: String(Number(count)),
    loose: stockText(looseUnits),
    unit: pack.unitSymbol,
    unitType: pack.unitType,
  };
  return { qty, packSnapshot: snapshot };
}
export function packInputQty(input: PackInput, packs: PackOption[]) {
  if (!input.packId) return input.qty;
  const pack = packs.find((p) => p.id === input.packId);
  if (!pack) throw new Error('Pack unavailable');
  return convertPack(pack, input.packCount ?? '0', input.looseQty ?? '0').qty;
}
export function packDescription(p: PackSnapshot | null | undefined) {
  if (!p) return '';
  return `${p.packs} × ${p.name} (${p.factor} ${p.unit} each)${Number(p.loose) > 0 ? ` + ${p.loose} ${p.unit} loose` : ''}`;
}
export function handoverPack(
  original: PackSnapshot | null | undefined,
  quantity: string,
): PackSnapshot | null {
  if (!original) return null;
  const qty = stockUnits(quantity);
  const factor = stockUnits(original.factor);
  return { ...original, packs: String(Math.floor(qty / factor)), loose: stockText(qty % factor) };
}
