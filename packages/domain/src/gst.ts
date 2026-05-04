/**
 * GST helpers — GSTIN state-code parsing + interstate detection.
 *
 * The CGST/SGST/IGST split itself lives in calculateSaleTotals (sale.ts) —
 * this module decides *whether* a sale is interstate when both GSTINs are
 * known, so the POS doesn't need a manual toggle for every bill.
 *
 * Reference: GSTIN format is 15 chars: state(2) + PAN(10) + entity(1) + Z + check(1).
 */

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/;

export const STATE_CODES: Readonly<Record<string, string>> = Object.freeze({
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
});

export function isValidGstin(gstin: string): boolean {
  return GSTIN_RE.test(gstin);
}

export function gstinStateCode(gstin: string): string | null {
  if (!isValidGstin(gstin)) return null;
  const code = gstin.slice(0, 2);
  return code in STATE_CODES ? code : null;
}

export function gstinStateName(gstin: string): string | null {
  const code = gstinStateCode(gstin);
  return code ? (STATE_CODES[code] ?? null) : null;
}

/**
 * Decide intra-vs-interstate from a pair of GSTINs.
 *  - both valid + same state → false (intrastate, CGST+SGST)
 *  - both valid + diff state → true (interstate, IGST)
 *  - either missing/invalid → null (caller falls back to UI toggle)
 */
export function isInterstate(
  supplierGstin: string | null,
  customerGstin: string | null,
): boolean | null {
  if (!supplierGstin || !customerGstin) return null;
  const a = gstinStateCode(supplierGstin);
  const b = gstinStateCode(customerGstin);
  if (!a || !b) return null;
  return a !== b;
}
