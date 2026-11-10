import { BadRequestException } from '@nestjs/common';
import { HrService } from './hr.service';

describe('HrService', () => {
  it('rejects employee creation without code', async () => {
    const db = { query: jest.fn(), connect: jest.fn() };
    const service = new HrService(db as never);
    await expect(
      service.createEmployee(
        { sub: 'u1', email: 'u@test.com', companyId: 'c1', roles: ['admin'] },
        { employeeCode: '', fullName: 'User' },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
