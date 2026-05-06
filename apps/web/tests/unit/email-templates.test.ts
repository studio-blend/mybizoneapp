import { invitationEmailTemplate, resetPasswordTemplate, verifyEmailTemplate } from '@mybizone/auth-config/email';
import { describe, expect, it } from 'vitest';

describe('invitationEmailTemplate', () => {
  it('contains the accept URL', () => {
    const { html, text } = invitationEmailTemplate(
      'https://example.com/accept-invite/abc123',
      'Rahul',
      'My Shop',
      'employee',
    );
    expect(html).toContain('https://example.com/accept-invite/abc123');
    expect(text).toContain('https://example.com/accept-invite/abc123');
  });

  it('mentions the business name', () => {
    const { subject, html } = invitationEmailTemplate(
      'https://x.com/tok',
      'Priya',
      'Krishnan Stores',
      'admin',
    );
    expect(subject).toContain('Krishnan Stores');
    expect(html).toContain('Krishnan Stores');
  });

  it('says admin for admin role', () => {
    const { text } = invitationEmailTemplate('https://x.com', 'A', 'B', 'admin');
    expect(text).toContain('an admin');
  });

  it('says employee for employee role', () => {
    const { text } = invitationEmailTemplate('https://x.com', 'A', 'B', 'employee');
    expect(text).toContain('an employee');
  });
});

describe('verifyEmailTemplate', () => {
  it('contains the URL', () => {
    const { html, text } = verifyEmailTemplate('https://x.com/verify/tok', 'Arun');
    expect(html).toContain('https://x.com/verify/tok');
    expect(text).toContain('https://x.com/verify/tok');
  });
});

describe('resetPasswordTemplate', () => {
  it('contains the URL', () => {
    const { html, text } = resetPasswordTemplate('https://x.com/reset/tok', 'Meena');
    expect(html).toContain('https://x.com/reset/tok');
    expect(text).toContain('https://x.com/reset/tok');
  });
});
