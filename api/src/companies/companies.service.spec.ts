import { ForbiddenException } from '@nestjs/common';
import { CompaniesService } from './companies.service';

describe('CompaniesService', () => {
  it('forbids non-admin user accessing another company', async () => {
    const db = {
      query: jest.fn(),
    };
    const service = new CompaniesService(db as never);
    await expect(
      service.getCompanyById('company-2', {
        sub: 'user-1',
        email: 'u@test.com',
        companyId: 'company-1',
        roles: ['user'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
