/**
 * Catalogue domain primitives — unit_type and unit_symbol live here so the
 * web form, the POS quantity validator, and any importer share one source of
 * truth for what's allowed.
 */

export const UNIT_TYPES = ['piece', 'weight', 'length', 'area', 'volume'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const UNIT_SYMBOLS_BY_TYPE: Readonly<Record<UnitType, readonly string[]>> = Object.freeze({
  piece: ['pc', 'pcs', 'box', 'pack', 'dozen', 'set'],
  weight: ['mg', 'g', 'kg', 'lb'],
  length: ['mm', 'cm', 'm', 'ft', 'in'],
  area: ['sqcm', 'sqm', 'sqft'],
  volume: ['ml', 'l', 'litre', 'oz'],
});

/** Whole-number-only types — POS rejects fractional qty for these. */
export const INTEGER_UNIT_TYPES: ReadonlySet<UnitType> = new Set(['piece']);

export function isUnitType(value: string): value is UnitType {
  return (UNIT_TYPES as readonly string[]).includes(value);
}

export function isValidUnit(type: string, symbol: string): boolean {
  if (!isUnitType(type)) return false;
  return UNIT_SYMBOLS_BY_TYPE[type].includes(symbol);
}

export function symbolsFor(type: UnitType): readonly string[] {
  return UNIT_SYMBOLS_BY_TYPE[type];
}

/**
 * True when a quantity may have decimals. Piece-counted goods (pieces, boxes,
 * dozens) don't — POS rejects 1.5 of those.
 */
export function allowsFractionalQty(type: UnitType): boolean {
  return !INTEGER_UNIT_TYPES.has(type);
}

/** Display helper: "1.5 kg", "3 pc". Trailing zeros trimmed for fractional types. */
export function formatQty(qty: string | number, unitSymbol: string): string {
  const n = typeof qty === 'string' ? Number.parseFloat(qty) : qty;
  if (!Number.isFinite(n)) return `${qty} ${unitSymbol}`;
  // Strip trailing zeros, but keep at least one digit after the decimal if any.
  const formatted = n.toString();
  return `${formatted} ${unitSymbol}`;
}
