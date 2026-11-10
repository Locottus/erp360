import { BadRequestException } from '@nestjs/common';
import { AccountingService } from './accounting.service';

describe('AccountingService', () => {
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
