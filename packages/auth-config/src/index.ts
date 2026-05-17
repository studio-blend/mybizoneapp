import type { Database } from '@mybizone/db';
import { account, session, user, verification } from '@mybizone/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { type MailerEnv, createMailer, resetPasswordTemplate, verifyEmailTemplate } from './email';

export interface AuthEnv extends MailerEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  LAN_MODE?: boolean;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export function createAuth(db: Database, env: AuthEnv) {
  const sendMail = createMailer(env);
  // LAN deployments with no email backend: skip verification entirely.
  const skipEmailVerification = env.LAN_MODE === true && !env.RESEND_API_KEY;

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),

    databaseHooks: skipEmailVerification
      ? {
          user: {
            create: {
              before: async (u) => ({ data: { ...u, emailVerified: true } }),
            },
          },
        }
      : undefined,

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: !skipEmailVerification,
      autoSignIn: false,
      minPasswordLength: 8,
      sendResetPassword: async ({ user: u, url }) => {
        const { subject, html, text } = resetPasswordTemplate(url, u.name);
        await sendMail({ to: u.email, subject, html, text });
      },
    },

    emailVerification: {
      sendOnSignUp: !skipEmailVerification,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: u, url }) => {
        if (skipEmailVerification) return;
        const { subject, html, text } = verifyEmailTemplate(url, u.name);
        await sendMail({ to: u.email, subject, html, text });
      },
    },

    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          },
        }
      : {}),

    user: {
      additionalFields: {
        businessId: { type: 'string', required: false, input: false },
        role: { type: 'string', required: false, defaultValue: 'owner', input: false },
        empId: { type: 'string', required: false, input: false },
        mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day rolling
    },

    advanced: {
      cookiePrefix: 'mybizone',
      useSecureCookies: !env.LAN_MODE && env.BETTER_AUTH_URL.startsWith('https://'),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
