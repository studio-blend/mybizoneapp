import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  execFile: vi.fn(),
  verifyLicense: vi.fn(),
}));
vi.mock('@/lib/backup-access', () => ({ canManageInstanceBackups: mocks.allowed }));
vi.mock('node:fs', () => ({
  default: { readdirSync: mocks.readdir, readFileSync: mocks.readFile },
}));
vi.mock('node:fs/promises', () => ({ mkdir: mocks.mkdir, rename: mocks.rename, rm: mocks.rm }));
vi.mock('node:child_process', () => ({ execFile: mocks.execFile }));
vi.mock('@mybizone/auth-config/license', () => ({ verifyLicenseKey: mocks.verifyLicense }));

import { restoreBackupAction, triggerBackupAction } from '../../app/(app)/settings/system/actions';
import { GET as download } from '../../app/api/backup/download/route';
import { GET as status } from '../../app/api/backup/status/route';
import { GET as license } from '../../app/api/license/validate/route';

describe('backup entry points', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('LAN_MODE', 'true');
    mocks.allowed.mockResolvedValue(true);
    mocks.readdir.mockReturnValue(['2026-09-24.dump']);
    mocks.readFile.mockReturnValue(Buffer.from('test-backup'));
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => callback(null, '', ''));
  });
  afterEach(() => vi.unstubAllEnvs());
  it('denies status, download and trigger before any filesystem or database subprocess access', async () => {
    mocks.allowed.mockResolvedValue(false);
    expect((await status()).status).toBe(403);
    expect((await download()).status).toBe(403);
    expect(await triggerBackupAction()).toEqual({ error: 'Permission denied' });
    expect(mocks.readdir).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.execFile).not.toHaveBeenCalled();
  });
  it('serves an authorized backup and status without caching its contents', async () => {
    expect(await (await status()).json()).toEqual({ lastBackup: '2026-09-24.dump', count: 1 });
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('test-backup');
  });
  it('allows the authorized trigger and keeps restore offline', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test');
    expect(await triggerBackupAction()).toMatchObject({ success: true });
    expect(mocks.execFile).toHaveBeenCalledOnce();
    expect(mocks.execFile.mock.calls[0]?.[0]).toBe('pg_dump');
    expect(mocks.rename).toHaveBeenCalledOnce();
    expect(await restoreBackupAction(null, new FormData())).toMatchObject({
      error: expect.stringContaining('server administrator'),
    });
    expect(mocks.execFile).toHaveBeenCalledOnce();
  });
  it('keeps public license probes free of business and license details', async () => {
    vi.stubEnv('LICENSE_KEY', 'mock-license');
    mocks.verifyLicense.mockReturnValue({
      valid: true,
      payload: { sub: 'private-business', plan: 'pro', exp: 1 },
    });
    expect(await (await license()).json()).toEqual({ valid: true });
  });
});
