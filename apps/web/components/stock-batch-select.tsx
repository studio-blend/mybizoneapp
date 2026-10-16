import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';

export type BatchChoice = {
  id: string;
  productId: string;
  code: string;
  expiresOn: string | null;
  state: string;
  quantity: string;
};
export function StockBatchSelect({
  batches,
  productId,
  id,
  name,
  value,
  onChange,
}: {
  batches: BatchChoice[];
  productId: string;
  id: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Physical batch</Label>
      <Select
        id={id}
        name={name}
        required
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      >
        <option value="">Select the lot being removed</option>
        {batches
          .filter((batch) => batch.productId === productId)
          .map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.code} · {batch.quantity} · expiry {batch.expiresOn ?? 'unknown'}
              {batch.state === 'quarantine' ? ' · quarantined' : ''}
            </option>
          ))}
      </Select>
    </div>
  );
}
