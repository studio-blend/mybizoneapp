'use client';

import { parseSerialText } from '@/lib/serial-policy';
import { Label } from '@mybizone/ui/label';
import { Textarea } from '@mybizone/ui/textarea';

export function SerialNumbersField({
  id,
  name,
  value,
  onChange,
  required = true,
  hint,
  available,
}: {
  id: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  hint?: string;
  available?: string[];
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>Serial numbers (one per line)</Label>
      <Textarea
        id={id}
        name={name}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        required={required}
        maxLength={50000}
        rows={3}
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="Scan or enter each physical unit’s serial"
      />
      <p className="text-xs text-muted-foreground">
        {hint ??
          'One distinct serial for every whole piece. Letters are normalized to uppercase; up to 500 pieces per line.'}
        {value !== undefined ? ` ${parseSerialText(value).length} entered.` : ''}
      </p>
      {available && (
        <details className="text-xs">
          <summary className="cursor-pointer">Available serials (up to 20)</summary>
          <p className="mt-2 break-all leading-relaxed">
            {available.length
              ? available.join(', ')
              : 'No units currently available. Quarantined units require inspection.'}
          </p>
        </details>
      )}
    </div>
  );
}
