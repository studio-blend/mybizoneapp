import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { isBillingEnabled } from '@/lib/razorpay';
import { requireUser } from '@/lib/session';
import { PLAN_LIMITS } from '@mybizone/domain/plans';
import { withTenant } from '@mybizone/db/tenant';
import { getUsage } from '@mybizone/db';
import { CheckoutButton } from './_components/checkout-button';

export default async function BillingPage() {
  const user = await requireUser();
  const usage = await withTenant(db, user.businessId, (tx) => getUsage(user.businessId, tx));

  const isPro = usage.plan === 'pro';
  const limits = PLAN_LIMITS[isPro ? 'pro' : 'free'];

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing & Plan</h1>
        <p className="text-sm text-muted-foreground">Current plan and usage</p>
      </div>

      {/* Current plan */}
      <div className="rounded-lg border p-6 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Current plan</h2>
          <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${isPro ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-muted text-muted-foreground'}`}>
            {isPro ? 'Pro' : 'Free'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {isPro ? 'Unlimited stores, products, and team members.' : 'Up to 1 store, 500 products, 1 user.'}
        </p>
      </div>

      {/* Usage */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="font-semibold text-lg">Usage</h2>
        <UsageBar label="Stores" current={usage.storeCount} limit={limits.stores} />
        <UsageBar label="Products" current={usage.productCount} limit={limits.products} />
        <UsageBar label="Team members" current={usage.userCount} limit={limits.users} />
      </div>

      {/* Upgrade */}
      {!isPro && (
        <div className="rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold text-lg">Upgrade to Pro</h2>
          <p className="text-sm text-muted-foreground">Unlock unlimited stores, products, and team members.</p>

          {env.LAN_MODE ? (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Self-hosted deployment — use a license key to activate Pro. Contact support to purchase.
            </div>
          ) : !isBillingEnabled() ? (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Billing is not configured on this deployment.
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 rounded-md border p-4 space-y-3">
                <p className="font-medium">Monthly</p>
                <p className="text-2xl font-bold">₹499<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <CheckoutButton interval="monthly" />
              </div>
              <div className="flex-1 rounded-md border border-green-500 p-4 space-y-3 relative">
                <span className="absolute -top-2.5 left-4 rounded-full bg-green-600 px-2 py-0.5 text-xs text-white font-medium">Best value</span>
                <p className="font-medium">Annual</p>
                <p className="text-2xl font-bold">₹4,999<span className="text-sm font-normal text-muted-foreground">/yr</span></p>
                <p className="text-xs text-green-700 dark:text-green-400">2 months free</p>
                <CheckoutButton interval="annual" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const pct = limit === Infinity ? 0 : Math.min(100, Math.round((current / limit) * 100));
  const nearLimit = pct >= 80;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {current} / {limit === Infinity ? '∞' : limit}
        </span>
      </div>
      {limit !== Infinity && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${nearLimit ? 'bg-amber-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
