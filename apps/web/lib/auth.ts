import { type Auth, createAuth } from '@mybizone/auth-config';
import { db } from './db';
import { env } from './env';

declare global {
  var __mybizone_auth: Auth | undefined;
}

function getAuth(): Auth {
  if (!globalThis.__mybizone_auth) {
    console.log('[auth:init] RESEND_API_KEY set:', !!env.RESEND_API_KEY, '| EMAIL_FROM:', env.EMAIL_FROM);
    globalThis.__mybizone_auth = createAuth(db, {
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: env.BETTER_AUTH_URL,
      RESEND_API_KEY: env.RESEND_API_KEY || undefined,
      EMAIL_FROM: env.EMAIL_FROM,
      LAN_MODE: env.LAN_MODE,
    });
  }
  return globalThis.__mybizone_auth;
}

export const auth: Auth = getAuth();
