import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const user = { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] };

  it('rejects adjustment with invalid direction', async () => {
    const db = { connect: jest.fn(), query: jest.fn() };
    const service = new InventoryService(db as never);
    await expect(
      service.adjustStock(user, {
        productId: 'p1',
        direction: 'invalid' as never,
        quantity: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects adjustment with non-positive quantity', async () => {
    const db = { connect: jest.fn(), query: jest.fn() };
    const service = new InventoryService(db as never);
    await expect(
      service.adjustStock(user, {
        productId: 'p1',
        direction: 'in',
        quantity: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
