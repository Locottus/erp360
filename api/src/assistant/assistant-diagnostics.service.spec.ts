import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database.service';
import type { AuthTokenPayload } from '../auth/auth.types';
import { AssistantDiagnosticsService, providerDiagnostic } from './assistant-diagnostics.service';

describe('Purchase order diagnostics', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  const user: AuthTokenPayload = {
    sub: 'user',
    companyId: 'company',
    email: 'user@example.test',
    roles: ['admin'],
    permissions: ['*'],
  };
  const target = { kind: 'purchase-order', id };
  const row = { status: 'received', has_lines: true, has_legacy: false, pending_lines: 1,
    over_received_lines: 0, overdue: false, posted: false };
  const query = jest.fn();
  const release = jest.fn();
  const audit = jest.fn();
  const connect = jest.fn();
  let service: AssistantDiagnosticsService;

  beforeEach(async () => {
    query.mockReset().mockImplementation((sql: string) => Promise.resolve({ rows: sql.includes('FROM purchase_orders po') ? [row] : [] }));
    release.mockReset(); audit.mockReset().mockResolvedValue({ rows: [] });
    connect.mockReset().mockResolvedValue({ query, release });
    const module = await Test.createTestingModule({ providers: [
      AssistantDiagnosticsService, { provide: DatabaseService, useValue: { connect, query: audit } },
    ] }).compile();
    service = module.get(AssistantDiagnosticsService);
  });

  it('reports incomplete received orders without sending identifiers to the provider', async () => {
    const report = await service.inspect(user, target);
    expect(report.findings.map(item => item.code)).toEqual(expect.arrayContaining(['order_pending_lines', 'order_not_posted']));
    expect(report.evidence[1].facts).toMatchObject({ state: 'received', pendingLines: 1, posted: false });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('po.company_id=$2'), [id, user.companyId]);
    expect(JSON.stringify(providerDiagnostic(report))).not.toContain(id);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not infer pending quantities from legacy receipts', async () => {
    query.mockImplementation((sql: string) => Promise.resolve({ rows: sql.includes('FROM purchase_orders po')
      ? [{ ...row, has_legacy: true, over_received_lines: 2 }] : [] }));
    const report = await service.inspect(user, target);
    expect(report.evidence[1].facts).toMatchObject({ hasLegacyReceipt: true, pendingLines: null, overReceivedLines: null });
    expect(report.findings.map(item => item.code)).toContain('legacy_receipt');
    expect(report.findings.map(item => item.code)).not.toContain('order_pending_lines');
    expect(report.findings.map(item => item.code)).not.toContain('order_over_received');
  });

  it('rejects unauthorized users and a missing order without disclosing other tenants', async () => {
    await expect(
      service.inspect(
        { ...user, roles: ['employee'], permissions: ['company.read'] },
        target,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(connect).not.toHaveBeenCalled();
    query.mockResolvedValue({ rows: [] });
    await expect(service.inspect(user, target)).rejects.toMatchObject({ status: 404 });
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(audit).not.toHaveBeenCalled();
  });
});
