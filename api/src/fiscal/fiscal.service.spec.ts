import { BadRequestException } from '@nestjs/common';
import { FiscalService } from './fiscal.service';

describe('FiscalService', () => {
  it('rejects empty provider code', async () => {
    const db = { query: jest.fn(), connect: jest.fn() };
    const service = new FiscalService(db as never);
    await expect(
      service.upsertProviderConfig(
        { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] },
        {
          countryCode: 'GT',
          providerCode: '',
          environment: 'sandbox',
          endpointUrl: 'https://example.com',
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
