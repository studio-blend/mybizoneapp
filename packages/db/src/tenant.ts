import { sql } from 'drizzle-orm';
import type { Database } from './index';

/**
 * Run a callback inside a transaction with `app.business_id` SET LOCAL to the tenant.
 * Every query inside the callback is filtered by Postgres RLS policies.
 *
 * Bypassing this helper means the query runs without tenant context — RLS blocks
 * all rows from tenant-scoped tables (queries return 0 rows for the regular role).
 */
export async function withTenant<T>(
  db: Database,
  businessId: string,
  fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL ROLE app_user: switches the active role for this transaction
    // only. Required because the underlying connection user is typically a
    // superuser (SUPERUSER bypasses RLS regardless of FORCE ROW LEVEL SECURITY).
    // app_user has NOBYPASSRLS, so RLS policies actually fire.
    await tx.execute(sql`SET LOCAL ROLE app_user`);
    await tx.execute(sql`SELECT set_config('app.business_id', ${businessId}, true)`);
    return fn(tx);
  });
}
