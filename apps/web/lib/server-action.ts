import { withTenant } from '@mybizone/db/tenant';
import type { z } from 'zod';
import { db } from './db';
import { type AppUser, requireUser } from './session';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

interface ActionContext {
  user: AppUser & { businessId: string };
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
}

/**
 * Wrap a Server Action: requires authenticated user + tenant, parses input
 * with the given Zod schema, runs the body inside a tenant-scoped transaction
 * (RLS active for every query). Returns a typed result; errors are stringified
 * for the client without leaking stack traces.
 *
 * Schema generic is `ZodTypeAny` (not `ZodType<T>`) so transforms — which
 * change input vs output types, e.g. `string | undefined → string | null` —
 * type-check correctly.
 */
export function safeAction<TSchema extends z.ZodTypeAny, TOutput>(
  schema: TSchema,
  handler: (input: z.infer<TSchema>, ctx: ActionContext) => Promise<TOutput>,
) {
  return async (rawInput: unknown): Promise<ActionResult<TOutput>> => {
    const parsed = schema.safeParse(rawInput);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return {
        ok: false,
        error: first ? `${first.path.join('.')}: ${first.message}` : 'invalid input',
      };
    }
    try {
      const user = await requireUser();
      const data = await withTenant(db, user.businessId, (tx) =>
        handler(parsed.data, { user, tx }),
      );
      return { ok: true, data };
    } catch (err) {
      console.error('[server-action]', err);
      const msg = err instanceof Error ? err.message : 'server error';
      // Don't leak stack to client; only the message.
      return { ok: false, error: msg };
    }
  };
}
