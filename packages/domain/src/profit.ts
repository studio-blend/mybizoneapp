export interface ProfitLine {
  lineTotal: number;
  qty: number;
  costPriceAtSale: number | null;
}

export interface ProfitResult {
  estimatedProfit: number;
  coveredItems: number;
  totalItems: number;
}

/**
 * Calculates estimated profit from sale line items.
 * Lines with null costPriceAtSale contribute 0 to profit but are counted in totalItems.
 * "Estimated" because cost data may be incomplete.
 */
export function calculateProfit(lines: ProfitLine[]): ProfitResult {
  let estimatedProfit = 0;
  let coveredItems = 0;
  for (const l of lines) {
    if (l.costPriceAtSale !== null) {
      estimatedProfit += l.lineTotal - l.costPriceAtSale * l.qty;
      coveredItems++;
    }
  }
  return { estimatedProfit, coveredItems, totalItems: lines.length };
}
