import type { Database } from '@mybizone/db';
import { account, session, user, verification } from '@mybizone/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { type MailerEnv, createMailer, resetPasswordTemplate, verifyEmailTemplate } from './email';

export interface AuthEnv extends MailerEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

export function createAuth(db: Database, env: AuthEnv) {
  const sendMail = createMailer(env);

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      sendResetPassword: async ({ user: u, url }) => {
        const { subject, html, text } = resetPasswordTemplate(url, u.name);
        await sendMail({ to: u.email, subject, html, text });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: u, url }) => {
        const { subject, html, text } = verifyEmailTemplate(url, u.name);
        await sendMail({ to: u.email, subject, html, text });
      },
    },

    user: {
      additionalFields: {
        businessId: { type: 'string', required: false, input: false },
        role: { type: 'string', required: false, defaultValue: 'owner', input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day rolling
    },

    advanced: {
      cookiePrefix: 'mybizone',
      useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://'),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
