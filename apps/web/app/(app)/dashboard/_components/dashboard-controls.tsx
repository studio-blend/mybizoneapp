'use client';
import {
  DASHBOARD_VIEWS,
  type DashboardSelection,
  type DashboardView,
  type ScopeDepartment,
  type ScopeStore,
} from '@/lib/dashboard-policy';
import { useState } from 'react';

export function DashboardControls({
  views,
  stores,
  departments,
  selection,
}: {
  views: DashboardView[];
  stores: ScopeStore[];
  departments: ScopeDepartment[];
  selection: DashboardSelection;
}) {
  const [pending, setPending] = useState(false);
  function change(select: HTMLSelectElement, resetScope = false) {
    if (resetScope)
      for (const name of select.name === 'view' ? ['storeId', 'departmentId'] : ['departmentId']) {
        const field = select.form?.elements.namedItem(name);
        if (field instanceof HTMLSelectElement) field.value = '';
      }
    select.form?.requestSubmit();
  }
  const control =
    'mt-1 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
  return (
    <form
      action="/dashboard"
      method="get"
      onSubmit={() => setPending(true)}
      aria-label="Dashboard filters"
      aria-busy={pending}
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:flex xl:items-end"
    >
      <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
        Workspace
        <select
          name="view"
          className={control}
          defaultValue={selection.view}
          onChange={(e) => change(e.currentTarget, true)}
        >
          {views.map((view) => (
            <option key={view} value={view}>
              {DASHBOARD_VIEWS[view].label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
        Period
        <select
          name="range"
          className={control}
          defaultValue={selection.range}
          onChange={(e) => change(e.currentTarget)}
        >
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">Month to date</option>
          <option value="quarter">Quarter to date</option>
        </select>
      </label>
      {stores.length > 0 && (
        <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          Store
          <select
            name="storeId"
            className={control}
            defaultValue={selection.storeId ?? ''}
            onChange={(e) => change(e.currentTarget, true)}
          >
            <option value="">
              {stores.length === 1 ? stores[0]?.name : 'All assigned stores'}
            </option>
            {stores.length > 1 &&
              stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {departments.length > 0 && (
        <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          Department
          <select
            name="departmentId"
            className={control}
            defaultValue={selection.departmentId ?? ''}
            onChange={(e) => change(e.currentTarget)}
          >
            <option value="">
              {departments.length === 1 ? departments[0]?.name : 'All assigned departments'}
            </option>
            {departments.length > 1 &&
              departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'Updating…' : 'Apply'}
      </button>
    </form>
  );
}
