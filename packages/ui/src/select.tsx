import { type SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from './utils';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

// Native <select> styled to match Input. Avoids the weight of @radix-ui/react-select
// for the M2 catalogue forms; we can swap in a richer combobox later if needed.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = 'Select';
