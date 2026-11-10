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
});
