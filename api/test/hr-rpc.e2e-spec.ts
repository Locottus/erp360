import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

function extractXmlStringByMember(xml: string, memberName: string): string | null {
  const regex = new RegExp(
    `<name>${memberName}<\\/name>\\s*<value>\\s*<string>([\\s\\S]*?)<\\/string>\\s*<\\/value>`,
    'i',
  );
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function extractJwtFromXml(xml: string): string | null {
  const match = xml.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return match ? match[0] : null;
}

describe('HR + RPC Legacy (e2e)', () => {
  let app: INestApplication<App>;
  let token = '';
  const suffix = Date.now().toString();
  const adminEmail = `admin.hr.${suffix}@erp360.local`;
  const adminPassword = 'ChangeMe123!';
  let employeeId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
      companyCode: `HR${suffix}`,
      companyName: `HR Company ${suffix}`,
      email: adminEmail,
      password: adminPassword,
      fullName: 'HR Admin',
    });

    const login = await request(app.getHttpServer()).post('/auth/login').send({
      email: adminEmail,
      password: adminPassword,
    });
    token = login.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('completes HR employee attendance and leave flow', async () => {
    const employee = await request(app.getHttpServer())
      .post('/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeCode: `EMP-${suffix}`,
        fullName: 'Employee HR E2E',
        email: 'employee.hr@example.com',
        jobTitle: 'Analyst',
      })
      .expect(201);
    employeeId = employee.body.id;

    const checkIn = await request(app.getHttpServer())
      .post('/hr/attendance/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/hr/attendance/check-out')
      .set('Authorization', `Bearer ${token}`)
      .send({ attendanceId: checkIn.body.id })
      .expect(201);

    const leave = await request(app.getHttpServer())
      .post('/hr/leave-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        startDate: '2026-11-20',
        endDate: '2026-11-22',
        reason: 'Medical checkups',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/hr/leave-requests/${leave.body.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Approved by manager' })
      .expect(201);

    const leaves = await request(app.getHttpServer())
      .get('/hr/leave-requests')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(leaves.body.some((row: { id: string; status: string }) => row.id === leave.body.id && row.status === 'approved')).toBe(
      true,
    );
  });

  it('supports XML-RPC authenticate and search_read', async () => {
    const authXml = `<?xml version="1.0"?>
      <methodCall>
        <methodName>common.authenticate</methodName>
        <params>
          <param><value><string>${adminEmail}</string></value></param>
          <param><value><string>${adminPassword}</string></value></param>
        </params>
      </methodCall>`;
    const authResponse = await request(app.getHttpServer())
      .post('/rpc/xmlrpc')
      .send({ xml: authXml })
      .expect(200);

    const rpcToken = extractXmlStringByMember(authResponse.text, 'token') ?? extractJwtFromXml(authResponse.text);
    if (!rpcToken) {
      throw new Error(`XML-RPC auth response: ${authResponse.text}`);
    }

    const searchXml = `<?xml version="1.0"?>
      <methodCall>
        <methodName>object.execute_kw</methodName>
        <params>
          <param><value><string>${rpcToken}</string></value></param>
          <param><value><string>hr.employee</string></value></param>
          <param><value><string>search_read</string></value></param>
          <param>
            <value>
              <struct>
                <member><name>limit</name><value><int>20</int></value></member>
              </struct>
            </value>
          </param>
        </params>
      </methodCall>`;

    const searchResponse = await request(app.getHttpServer())
      .post('/rpc/xmlrpc')
      .send({ xml: searchXml })
      .expect(200);

    expect(searchResponse.text).toContain('EMP-');
  });
});
