export const fundsCommands = [
  'advance',
  'advance_apply',
  'advance_refund',
  'return_refund',
  'settlement_reverse',
  'allocation_reverse',
  'money_reverse',
] as const;
export type FundsCommand = (typeof fundsCommands)[number];
export const fundsLabels: Record<FundsCommand, string> = {
  advance: 'Record advance',
  advance_apply: 'Apply advance to bill',
  advance_refund: 'Refund unused advance',
  return_refund: 'Record return refund',
  settlement_reverse: 'Reverse settlement',
  allocation_reverse: 'Reverse bill allocation',
  money_reverse: 'Reverse advance / refund',
};
