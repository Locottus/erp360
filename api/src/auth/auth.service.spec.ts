import { AuthService } from './auth.service';

describe('AuthService RBAC overrides', () => {
  it('reports MFA status without exposing the stored secret', async () => {
    const db = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ enabled: true }] }),
    };
    const service = new AuthService(db as never);

    await expect(
      service.getMfaStatus({ sub: 'u1' } as never),
    ).resolves.toEqual({ enabled: true, configured: true });
  });

  it('denies a specific permission over a wildcard role', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ code: '*' }] })
        .mockResolvedValueOnce({ rows: [{ code: 'sales.read' }, { code: 'sales.create' }] })
        .mockResolvedValueOnce({
          rows: [{ permission_code: 'sales.create', effect: 'deny' }],
        }),
    };
    const service = new AuthService(db as never);

    await expect(service.getEffectivePermissions('u1', 'c1')).resolves.toEqual([
      'sales.read',
    ]);
  });

  it('grants a permission to a role that does not have it', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ code: 'sales.read' }] })
        .mockResolvedValueOnce({
          rows: [{ permission_code: 'accounting.read', effect: 'grant' }],
        }),
    };
    const service = new AuthService(db as never);

    await expect(service.getEffectivePermissions('u1', 'c1')).resolves.toEqual([
      'accounting.read',
      'sales.read',
    ]);
  });

  it('resets an enabled MFA factor transactionally and increments the identity revision', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'u2', management_revision: 3 }] })
        .mockResolvedValueOnce({ rows: [{ user_id: 'u2', enabled: true }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) };
    const service = new AuthService(db as never);

    await expect(
      service.resetUserMfa(
        { sub: 'u1', companyId: 'c1' } as never,
        'u2',
        { expectedRevision: 3, reason: 'Verified account recovery request' },
      ),
    ).resolves.toEqual({ reset: true, revision: 4 });
  });
});
