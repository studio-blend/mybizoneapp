import { createMailer } from '@mybizone/auth-config/email';
import { env } from './env';

export const sendMail = createMailer({
  RESEND_API_KEY: env.RESEND_API_KEY || undefined,
  EMAIL_FROM: env.EMAIL_FROM,
});
