import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  limit: vi.fn(),
  getUserRoles: vi.fn(),
}));
vi.mock('../../lib/get-user-roles', () => ({ getUserRoles: mocks.getUserRoles }));
vi.mock('../../lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('../../lib/db', () => ({
  db: { select: () => ({ from: () => ({ limit: mocks.limit }) }) },
}));
import { canManageInstanceBackups } from '../../lib/backup-access';

describe('instance backup authorization', () => {
  beforeEach(() => {
    mocks.getUserRoles.mockResolvedValue([{ role: 'super_admin' }]);
    vi.stubEnv('LAN_MODE', 'true');
    mocks.getSessionUser.mockResolvedValue({
      role: 'owner',
      businessId: 'shop-a',
      mustChangePassword: false,
    });
    mocks.limit.mockResolvedValue([{ id: 'shop-a' }]);
  });
  it('rejects revoked ownership, scoped ownership and a different sole business', async () => {
    mocks.getUserRoles.mockResolvedValue([]);
    expect(await canManageInstanceBackups()).toBe(false);
    mocks.getUserRoles.mockResolvedValue([{ role: 'super_admin', storeId: 'store-a' }]);
    expect(await canManageInstanceBackups()).toBe(false);
    mocks.getUserRoles.mockResolvedValue([{ role: 'super_admin' }]);
    mocks.limit.mockResolvedValue([{ id: 'shop-b' }]);
    expect(await canManageInstanceBackups()).toBe(false);
  });
  it('allows only the sole LAN business owner', async () => {
    expect(await canManageInstanceBackups()).toBe(true);
    vi.stubEnv('LAN_MODE', 'false');
    expect(await canManageInstanceBackups()).toBe(false);
  });
  it('rejects unauthenticated users and employees', async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    expect(await canManageInstanceBackups()).toBe(false);
    mocks.getSessionUser.mockResolvedValue({ role: 'admin', businessId: 'shop-a' });
    expect(await canManageInstanceBackups()).toBe(false);
  });
  it('rejects multi-tenant exports and incomplete password changes', async () => {
    mocks.limit.mockResolvedValue([{ id: 'shop-a' }, { id: 'shop-b' }]);
    expect(await canManageInstanceBackups()).toBe(false);
    mocks.limit.mockResolvedValue([{ id: 'shop-a' }]);
    mocks.getSessionUser.mockResolvedValue({
      role: 'owner',
      businessId: 'shop-a',
      mustChangePassword: true,
    });
    expect(await canManageInstanceBackups()).toBe(false);
  });
});
