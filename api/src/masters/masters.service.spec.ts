import { BadRequestException } from '@nestjs/common';
import { MastersService } from './masters.service';

describe('MastersService', () => {
  it('rejects negative product unit price', async () => {
    const db = { query: jest.fn() };
    const service = new MastersService(db as never);

    await expect(
      service.createProduct(
        { sub: 'u1', email: 'u@x.com', companyId: 'c1', roles: ['admin'] },
        { sku: 'SKU-1', name: 'Product', unitPrice: -1 },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects tax rate outside 0..100', async () => {
    const db = { query: jest.fn() };
    const service = new MastersService(db as never);

    await expect(
      service.createTaxRate(
        { sub: 'u1', email: 'u@x.com', companyId: 'c1', roles: ['admin'] },
        { code: 'VAT-200', name: 'Invalid VAT', rate: 200, taxType: 'vat' },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
