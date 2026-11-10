import { BadRequestException } from '@nestjs/common';
import { CommerceService } from './commerce.service';

describe('CommerceService', () => {
  const user = { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] };

  it('rejects quotation without lines', async () => {
    const db = { query: jest.fn(), connect: jest.fn() };
    const service = new CommerceService(db as never);
    await expect(
      service.createQuotation(user, {
        quotationNumber: 'Q-1',
        customerId: 'cust-1',
        lines: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects purchase request without supplier', async () => {
    const db = { query: jest.fn(), connect: jest.fn() };
    const service = new CommerceService(db as never);
    await expect(
      service.createPurchaseRequest(user, {
        requestNumber: 'PR-1',
        supplierId: '',
        lines: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
