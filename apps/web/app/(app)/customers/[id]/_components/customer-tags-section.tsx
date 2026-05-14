'use client';

import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { useEffect, useRef, useState, useTransition } from 'react';
import { addCustomerTagAction, removeCustomerTagAction } from '../actions';

const PRESET_TAGS = ['VIP', 'Wholesale', 'Inactive', 'Regular', 'Bulk Buyer', 'Credit Risk', 'New Customer'];

const TAG_COLORS: Record<string, string> = {
  VIP: 'bg-purple-100 text-purple-800 border-purple-200',
  Wholesale: 'bg-blue-100 text-blue-800 border-blue-200',
  Inactive: 'bg-gray-100 text-gray-600 border-gray-200',
  Regular: 'bg-green-100 text-green-800 border-green-200',
  'Bulk Buyer': 'bg-orange-100 text-orange-800 border-orange-200',
  'Credit Risk': 'bg-red-100 text-red-800 border-red-200',
  'New Customer': 'bg-teal-100 text-teal-800 border-teal-200',
};

interface TagItem {
  id: string;
  tag: string;
}

export function CustomerTagsSection({
  customerId,
  initialTags,
}: {
  customerId: string;
  initialTags: TagItem[];
}) {
  const [tags, setTags] = useState<TagItem[]>(initialTags);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [isPending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || tags.some((t) => t.tag === trimmed)) return;
    startTransition(async () => {
      const res = await addCustomerTagAction({ customerId, tag: trimmed });
      if (res.ok) {
        setTags((prev) => [...prev, { id: crypto.randomUUID(), tag: trimmed }]);
      }
    });
    setCustom('');
    setOpen(false);
  }

  function removeTag(tagId: string) {
    startTransition(async () => {
      const res = await removeCustomerTagAction({ tagId, customerId });
      if (res.ok) {
        setTags((prev) => prev.filter((t) => t.id !== tagId));
      }
    });
  }

  const existingTagNames = new Set(tags.map((t) => t.tag));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span
            key={t.id}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              TAG_COLORS[t.tag] ?? 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {t.tag}
            <button
              onClick={() => removeTag(t.id)}
              disabled={isPending}
              className="ml-0.5 leading-none hover:text-destructive disabled:opacity-50"
              aria-label={`Remove ${t.tag}`}
            >
              ×
            </button>
          </span>
        ))}

        <div className="relative" ref={popoverRef}>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setOpen((o) => !o)}
          >
            + Add Tag
          </Button>
          {open && (
            <div className="absolute left-0 top-8 z-10 w-64 rounded-md border bg-background p-3 shadow-md space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Preset tags</p>
              <div className="flex flex-wrap gap-1">
                {PRESET_TAGS.filter((pt) => !existingTagNames.has(pt)).map((pt) => (
                  <button
                    key={pt}
                    onClick={() => addTag(pt)}
                    disabled={isPending}
                    className={`rounded-full border px-2 py-0.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-50 ${
                      TAG_COLORS[pt] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {pt}
                  </button>
                ))}
              </div>
              <p className="text-xs font-medium text-muted-foreground">Custom tag</p>
              <div className="flex gap-2">
                <Input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag(custom)}
                  placeholder="e.g. Seasonal"
                  className="h-8 text-xs"
                  maxLength={50}
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => addTag(custom)}
                  disabled={!custom.trim() || isPending}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
