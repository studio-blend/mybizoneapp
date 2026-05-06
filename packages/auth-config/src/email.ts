/**
 * Tiny email sender. Uses Resend when RESEND_API_KEY is set; otherwise logs
 * to console (dev mode). Bigger React Email templates can replace these later.
 */
import { Resend } from 'resend';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailerEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export function createMailer(env: MailerEnv) {
  const from = env.EMAIL_FROM ?? 'MyBizOne <noreply@mybizone.local>';
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  return async function sendMail({ to, subject, html, text }: SendMailInput): Promise<void> {
    if (!resend) {
      console.warn('[email:dev]', { to, subject, text });
      return;
    }
    await resend.emails.send({ from, to, subject, html, text });
  };
}

export function verifyEmailTemplate(url: string, name: string) {
  const subject = 'Verify your MyBizOne account';
  const text = `Hi ${name},\n\nClick to verify your email:\n${url}\n\nIf you didn't sign up, ignore this.`;
  const html = `<p>Hi ${escapeHtml(name)},</p><p>Click to verify your email:</p><p><a href="${url}">${url}</a></p><p>If you didn't sign up, ignore this.</p>`;
  return { subject, text, html };
}

export function resetPasswordTemplate(url: string, name: string) {
  const subject = 'Reset your MyBizOne password';
  const text = `Hi ${name},\n\nClick to reset your password:\n${url}\n\nLink expires in 1 hour. If you didn't ask, ignore this.`;
  const html = `<p>Hi ${escapeHtml(name)},</p><p>Click to reset your password:</p><p><a href="${url}">${url}</a></p><p>Link expires in 1 hour. If you didn't ask, ignore this.</p>`;
  return { subject, text, html };
}

export function invitationEmailTemplate(
  acceptUrl: string,
  inviterName: string,
  businessName: string,
  role: string,
) {
  const subject = `You've been invited to join ${businessName} on MyBizOne`;
  const text = [
    `Hi,`,
    ``,
    `${inviterName} has invited you to join ${businessName} as ${role === 'admin' ? 'an admin' : 'an employee'}.`,
    ``,
    `Click the link below to accept (valid for 7 days):`,
    acceptUrl,
    ``,
    `If you weren't expecting this, you can safely ignore it.`,
  ].join('\n');
  const html = [
    `<p>Hi,</p>`,
    `<p>${escapeHtml(inviterName)} has invited you to join <strong>${escapeHtml(businessName)}</strong> as ${role === 'admin' ? 'an admin' : 'an employee'}.</p>`,
    `<p><a href="${acceptUrl}">Accept invitation</a> (valid for 7 days)</p>`,
    `<p>If you weren't expecting this, you can safely ignore it.</p>`,
  ].join('');
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
