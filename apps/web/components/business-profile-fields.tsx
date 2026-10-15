'use client';
import { BUSINESS_PROFILES, SELLING_MODELS } from '@/lib/business-profile';
import { useState } from 'react';

export function BusinessProfileFields({
  initialProfile = '',
  initialModel = '',
  inherit = false,
  defaultLabel,
}: {
  initialProfile?: string | null;
  initialModel?: string | null;
  inherit?: boolean;
  defaultLabel?: string;
}) {
  const [profile, setProfile] = useState(initialProfile ?? '');
  const selected = Object.entries(BUSINESS_PROFILES).find(([key]) => key === profile)?.[1];
  const selectClass = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-sm font-medium">Business profile</legend>
      <div className="space-y-2">
        <label htmlFor="businessProfile" className="block text-sm font-medium">
          What do you sell?
        </label>
        <select
          id="businessProfile"
          name="businessProfile"
          className={selectClass}
          value={profile || (inherit ? '' : 'general_retail')}
          onChange={(event) => setProfile(event.target.value)}
        >
          {inherit && (
            <option value="">Use business default{defaultLabel ? ` (${defaultLabel})` : ''}</option>
          )}
          {Object.entries(BUSINESS_PROFILES).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>
        {selected && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {selected.focus} Slow-stock review starts after {selected.slowDays} days without a sale.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="sellingModel" className="block text-sm font-medium">
          How do you sell?
        </label>
        <select
          id="sellingModel"
          name="sellingModel"
          className={selectClass}
          defaultValue={initialModel || (inherit ? '' : 'retail')}
        >
          {inherit && <option value="">Use business default</option>}
          {Object.entries(SELLING_MODELS).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sets dashboard priorities. Existing prices, customer price tiers and staff permissions
          stay in place.
        </p>
      </div>
    </fieldset>
  );
}
