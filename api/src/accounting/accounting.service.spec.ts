import { BadRequestException } from '@nestjs/common';
import { AccountingService } from './accounting.service';

describe('AccountingService', () => {
  it('rejects bank reversal without an audited reason', async () => {
    const db = { connect: jest.fn(), query: jest.fn() };
    const service = new AccountingService(db as never);
    await expect(
      service.reverseBankLine(
        { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] },
        '00000000-0000-0000-0000-000000000001',
        { reason: 'short' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('returns comparative income for the immediately preceding period', async () => {
    const db = {
      connect: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            { account_type: 'revenue', balance: '150', period_balance: '60', previous_period_balance: '40' },
            { account_type: 'expense', balance: '90', period_balance: '25', previous_period_balance: '20' },
            { account_type: 'asset', balance: '110', period_balance: '0', previous_period_balance: '0' },
            { account_type: 'liability', balance: '40', period_balance: '0', previous_period_balance: '0' },
            { account_type: 'equity', balance: '10', period_balance: '0', previous_period_balance: '0' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const service = new AccountingService(db as never);
    const report = await service.getFinancialStatements(
      { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] },
      undefined,
      '2026-11-01',
      '2026-11-30',
    );

    expect(report.incomeStatement.netIncome).toBe(35);
    expect(report.incomeStatement.comparative.netIncome).toBe(20);
  });

  it('reports inventory cost snapshot integrity without modifying data', async () => {
    const db = {
      connect: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{
            dispatch_movements: '10',
            dispatch_with_snapshot: '9',
            dispatch_without_snapshot: '1',
            dispatch_with_negative_cost: '0',
            dispatch_quantity_mismatch: '0',
            lot_quantity_negative: '0',
          }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const service = new AccountingService(db as never);
    const report = await service.getInventoryCostIntegrity({
      sub: 'u1',
      email: 'u@test.com',
      companyId: 'c1',
      roles: ['admin'],
    });

    expect(report.complete).toBe(false);
    expect(report.dispatchMovements).toBe(10);
    expect(report.dispatchWithoutSnapshot).toBe(1);
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('rejects payment with invalid amount', async () => {
    const db = { connect: jest.fn(), query: jest.fn() };
    const service = new AccountingService(db as never);
    await expect(
      service.registerInvoicePayment(
        { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] },
        'inv-1',
        { paymentReference: 'PMT-1', amount: 0 },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects close period with invalid month', async () => {
    const db = { connect: jest.fn(), query: jest.fn() };
    const service = new AccountingService(db as never);
    await expect(
      service.closePeriod(
        { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] },
        { year: 2026, month: 13 },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
