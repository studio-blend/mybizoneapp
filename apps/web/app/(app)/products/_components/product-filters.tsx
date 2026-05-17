'use client';

import { Input } from '@mybizone/ui/input';
import { Select } from '@mybizone/ui/select';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useTransition, useState, useEffect } from 'react';

interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

interface Option {
  id: string;
  name: string;
}

interface Props {
  categories: CategoryNode[];
  stores: Option[];
  brands: Option[];
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function ProductFilters({ categories, stores, brands }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentQ = searchParams?.get('q') ?? '';
  const currentCatId = searchParams?.get('categoryId') ?? '';
  const currentStoreId = searchParams?.get('storeId') ?? '';
  const currentBrandId = searchParams?.get('brandId') ?? '';

  const [q, setQ] = useState(currentQ);
  const debouncedQ = useDebounce(q, 300);

  // Hierarchical category state
  const topLevelCats = categories.filter((c) => !c.parentId);

  // Derive top-level and sub from current URL param
  const selectedCat = categories.find((c) => c.id === currentCatId);
  const initTopId = selectedCat?.parentId
    ? selectedCat.parentId
    : (selectedCat ? currentCatId : '');
  const initSubId = selectedCat?.parentId ? currentCatId : '';

  const [selectedTopId, setSelectedTopId] = useState(initTopId);
  const [selectedSubId, setSelectedSubId] = useState(initSubId);

  const subCategories = categories.filter((c) => c.parentId === selectedTopId);
  const hasSubcategories = subCategories.length > 0;

  // Push params to URL
  const applyParams = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? '');
      for (const [key, val] of Object.entries(params)) {
        if (val) sp.set(key, val);
        else sp.delete(key);
      }
      sp.delete('page');
      startTransition(() => {
        router.replace(`${pathname ?? '/products'}?${sp.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  // Sync debounced search
  useEffect(() => {
    if (debouncedQ !== currentQ) {
      applyParams({ q: debouncedQ });
    }
  }, [debouncedQ, currentQ, applyParams]);

  function handleTopCatChange(topId: string) {
    setSelectedTopId(topId);
    setSelectedSubId('');
    const subs = categories.filter((c) => c.parentId === topId);
    // If no subcategories, filter by top-level directly
    applyParams({ categoryId: topId });
  }

  function handleSubCatChange(subId: string) {
    setSelectedSubId(subId);
    applyParams({ categoryId: subId || selectedTopId });
  }

  function handleReset() {
    setQ('');
    setSelectedTopId('');
    setSelectedSubId('');
    startTransition(() => {
      router.replace(pathname ?? '/products');
    });
  }

  const hasFilters = !!(currentQ || currentCatId || currentStoreId || currentBrandId);

  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div className="flex-1 min-w-[180px]">
        <Input
          placeholder="Search products…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* Category — top level */}
      <div className="min-w-[140px]">
        <Select
          className="h-8 text-sm"
          value={selectedTopId}
          onChange={(e) => handleTopCatChange(e.target.value)}
        >
          <option value="">All categories</option>
          {topLevelCats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      {/* Sub-category — only when top-level has children */}
      {selectedTopId && hasSubcategories && (
        <div className="min-w-[140px]">
          <Select
            className="h-8 text-sm"
            value={selectedSubId}
            onChange={(e) => handleSubCatChange(e.target.value)}
          >
            <option value="">All sub-categories</option>
            {subCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      )}

      {/* Store */}
      {stores.length > 1 && (
        <div className="min-w-[120px]">
          <Select
            className="h-8 text-sm"
            value={currentStoreId}
            onChange={(e) => applyParams({ storeId: e.target.value })}
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      )}

      {/* Brand */}
      {brands.length > 0 && (
        <div className="min-w-[120px]">
          <Select
            className="h-8 text-sm"
            value={currentBrandId}
            onChange={(e) => applyParams({ brandId: e.target.value })}
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </div>
      )}

      {hasFilters && (
        <button
          onClick={handleReset}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors whitespace-nowrap"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
