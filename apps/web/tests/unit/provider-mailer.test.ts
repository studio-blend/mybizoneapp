import { createMailer } from '@mybizone/auth-config/email';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('mailer with mocked HTTP transport', () => {
  const request = vi.fn();
  const mail = {
    to: 'recipient@example.invalid',
    subject: 'Test',
    html: '<p>Test</p>',
    text: 'Test',
  };
  const deliver = createMailer({
    RESEND_API_KEY: 'mock-only',
    EMAIL_FROM: 'sender@example.invalid',
  });
  beforeEach(() => {
    request.mockReset();
    vi.stubGlobal('fetch', request);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a successful provider response', async () => {
    request.mockResolvedValue(
      new Response(JSON.stringify({ id: 'mock-message' }), { status: 200 }),
    );
    await expect(deliver(mail)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0]?.[1].body)).toMatchObject({
      ...mail,
      from: 'sender@example.invalid',
    });
  });

  it('rejects an API error without disclosing diagnostics and permits a caller retry', async () => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'sensitive provider diagnostic' }), { status: 429 }),
    );
    await expect(deliver(mail)).rejects.toThrow('Email delivery failed. Please try again.');
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'mock-retry' }), { status: 200 }),
    );
    await expect(deliver(mail)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not swallow transport failures', async () => {
    request.mockRejectedValue(new Error('mock network failure'));
    await expect(deliver(mail)).rejects.toThrow('Email delivery failed. Please try again.');
  });
});
