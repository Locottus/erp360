import { BadRequestException } from '@nestjs/common';
import { PortalService } from './portal.service';

describe('PortalService', () => {
  it('rejects empty customerId when creating token', async () => {
    const db = { query: jest.fn(), connect: jest.fn() };
    const service = new PortalService(db as never);
    await expect(
      service.createAccessToken(
        { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] },
        { customerId: '' },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
