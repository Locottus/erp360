import { BadRequestException } from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';

describe('EcommerceService', () => {
  it('rejects settings without storeName', async () => {
    const db = { query: jest.fn(), connect: jest.fn() };
    const service = new EcommerceService(db as never);
    await expect(
      service.upsertAdminSettings(
        { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] },
        { storeName: '', storeSlug: 'store' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects subscription with invalid email', async () => {
    const db = { query: jest.fn(), connect: jest.fn() };
    const service = new EcommerceService(db as never);
    await expect(
      service.subscribe('MAIN', {
        email: 'invalid',
        acceptsMarketing: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('hides inactive master products from the public catalog', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'company-1', code: 'MAIN' }] })
        .mockResolvedValueOnce({ rows: [{ store_name: 'Store', company_code: 'MAIN' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const service = new EcommerceService(db as never);

    await service.getStorefront('MAIN');

    expect(db.query.mock.calls[2][0]).toContain('p.is_active = TRUE');
  });

  it('does not publish an inactive master product', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'product-1', is_active: false }] }) };
    const service = new EcommerceService(db as never);

    await expect(service.publishListing(
      { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] },
      { productId: 'product-1', slug: 'product', title: 'Product', unitPrice: 10 },
    )).rejects.toThrow('Inactive products cannot be published.');
  });
});
