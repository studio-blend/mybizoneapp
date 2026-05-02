import { type Auth, createAuth } from '@mybizone/auth-config';
import { db } from './db';
import { env } from './env';

declare global {
  // biome-ignore lint/style/noVar: required to share singleton across HMR reloads
  var __mybizone_auth: Auth | undefined;
}

export const auth: Auth =
  globalThis.__mybizone_auth ??
  (globalThis.__mybizone_auth = createAuth(db, {
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    RESEND_API_KEY: env.RESEND_API_KEY || undefined,
    EMAIL_FROM: env.EMAIL_FROM,
  }));
