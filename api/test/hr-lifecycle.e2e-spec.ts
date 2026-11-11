import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Audited HR lifecycle', () => {
  let app: INestApplication; let token: string; let employeeId: string;
  const suffix = Date.now().toString();
  const post = (path: string, body: object) => request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send(body);
  const patch = (path: string, body: object) => request(app.getHttpServer()).patch(path).auth(token, { type: 'bearer' }).send(body);
  const employee = { fullName: 'Updated employee', email: '', jobTitle: 'Operator', hireDate: '2026-01-01', status: 'inactive', expectedRevision: 0, reason: 'Authorized employment record update' };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init();
    const email = `hr-life-${suffix}@example.test`;
    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
      companyCode: `HRLIFE-${suffix}`, companyName: 'HR lifecycle company', email,
      fullName: 'HR admin', password: 'HrLifecycle123!',
    }).expect(201);
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'HrLifecycle123!' }).expect(201)).body.access_token;
    employeeId = (await post('/hr/employees', { employeeCode: 'EMP-1', fullName: 'Employee', hireDate: '2026-01-01' }).expect(201)).body.id;
  });
  afterAll(async () => { await app.close(); });

  it('serializes check-in, blocks invalid checkout, keeps revisions and prevents attendance/leave overlaps', async () => {
    const checks = await Promise.all([
      post('/hr/attendance/check-in', { employeeId, checkInAt: '2026-01-02T08:00:00Z' }),
      post('/hr/attendance/check-in', { employeeId, checkInAt: '2026-01-02T08:00:00Z' }),
    ]);
    expect(checks.map(row => row.status).sort()).toEqual([201, 400]);
    const attendanceId = checks.find(row => row.status === 201)!.body.id;
    await patch(`/hr/employees/${employeeId}`, employee).expect(400);
    await post('/hr/attendance/check-out', { attendanceId, checkOutAt: '2026-01-02T07:00:00Z' }).expect(400);
    const exits = await Promise.all([
      post('/hr/attendance/check-out', { attendanceId, checkOutAt: '2026-01-02T16:00:00Z' }),
      post('/hr/attendance/check-out', { attendanceId, checkOutAt: '2026-01-02T17:00:00Z' }),
    ]);
    expect(exits.map(row => row.status).sort()).toEqual([201, 400]);
    const correction = { checkInAt: '2026-01-02T09:00:00Z', checkOutAt: '2026-01-02T16:00:00Z', expectedRevision: 1, reason: 'Authorized attendance correction' };
    await patch(`/hr/attendance/${attendanceId}`, correction).expect(200).expect(result => expect(result.body.totalMinutes).toBe(420));
    await patch(`/hr/attendance/${attendanceId}`, correction).expect(409);
    await post('/hr/leave-requests', { employeeId, startDate: '2026-02-31', endDate: '2026-03-01' }).expect(400);
    const leave = await post('/hr/leave-requests', { employeeId, startDate: '2026-01-03', endDate: '2026-01-04', reason: 'Test leave' }).expect(201);
    await post('/hr/leave-requests', { employeeId, startDate: '2026-01-04', endDate: '2026-01-05' }).expect(409);
    await post(`/hr/leave-requests/${leave.body.id}/approve`, { note: 'Approved' }).expect(201);
    await post('/hr/attendance/check-in', { employeeId, checkInAt: '2026-01-03T08:00:00Z' }).expect(400);
    await patch(`/hr/attendance/${attendanceId}`, { ...correction, expectedRevision: 2, checkOutAt: '2026-01-03T16:00:00Z' }).expect(400);
    await patch(`/hr/employees/${employeeId}`, employee).expect(200);
    await patch(`/hr/employees/${employeeId}`, employee).expect(409);
    await post('/hr/attendance/check-in', { employeeId, checkInAt: '2026-01-05T08:00:00Z' }).expect(400);
    await post('/hr/leave-requests', { employeeId, startDate: '2026-01-05', endDate: '2026-01-06' }).expect(400);
  });

  it('cancels approved leave with revision checking, preserves the decision and releases attendance/date conflicts', async () => {
    const id = (await post('/hr/employees', { employeeCode: 'EMP-CANCEL', fullName: 'Leave cancellation employee', hireDate: '2026-01-01' })).body.id as string;
    const leave = (await post('/hr/leave-requests', { employeeId: id, startDate: '2026-03-01', endDate: '2026-03-02', reason: 'Original request' })).body.id as string;
    const endpoint = `/hr/leave-requests/${leave}/cancel`;
    const cancellation = { expectedRevision: 0, reason: 'Employee no longer needs these days off' };
    await post(endpoint, { ...cancellation, reason: 'short' }).expect(400);
    await post(endpoint, { ...cancellation, expectedRevision: -1 }).expect(400);
    await post(`/hr/leave-requests/${leave}/approve`, { note: 'Original approved decision' }).expect(201);
    await post(endpoint, cancellation).expect(409);
    const concurrent = await Promise.all([
      post(endpoint, { ...cancellation, expectedRevision: 1 }),
      post(endpoint, { ...cancellation, expectedRevision: 1 }),
    ]);
    expect(concurrent.map(row => row.status).sort()).toEqual([201, 409]);
    await post(endpoint, { ...cancellation, expectedRevision: 2 }).expect(409);
    const listing = await request(app.getHttpServer()).get('/hr/leave-requests').auth(token, { type: 'bearer' }).expect(200);
    const cancelled = listing.body.find((row: { id: string }) => row.id === leave);
    expect(cancelled).toMatchObject({ status: 'cancelled', revision: 2, reason: 'Original request', decision_note: 'Original approved decision', cancellation_reason: cancellation.reason });
    expect(cancelled.decided_at).toBeTruthy(); expect(cancelled.cancelled_at).toBeTruthy();
    const attendanceId = (await post('/hr/attendance/check-in', { employeeId: id, checkInAt: '2026-03-01T08:00:00Z' }).expect(201)).body.id as string;
    await post('/hr/attendance/check-out', { attendanceId, checkOutAt: '2026-03-01T09:00:00Z' }).expect(201);
    await post('/hr/leave-requests', { employeeId: id, startDate: '2026-03-01', endDate: '2026-03-02', reason: 'New independent request' }).expect(201);
    const audit = await app.get(DatabaseService).query<{ payload: { before: { status: string }; after: { status: string } } }>(
      "SELECT payload FROM audit_log WHERE entity_id=$1 AND event_name='hr.leave.request.cancelled'", [leave],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].payload.before.status).toBe('approved');
    expect(audit.rows[0].payload.after.status).toBe('cancelled');
  });

  it('allows pending cancellation on inactive employees, rejects cancelled approvals and enforces tenant/admin', async () => {
    const leave = (await request(app.getHttpServer()).get('/hr/leave-requests').auth(token, { type: 'bearer' })).body.find((row: { reason: string }) => row.reason === 'New independent request');
    const input = { expectedRevision: 0, reason: 'Administrative withdrawal of pending absence' };
    const endpoint = `/hr/leave-requests/${leave.id}/cancel`;
    const email = `hr-other-${suffix}@example.test`;
    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
      companyCode: `HROTHER-${suffix}`, companyName: 'Other company', email, fullName: 'Other admin', password: 'HrLifecycle123!',
    }).expect(201);
    const otherToken = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'HrLifecycle123!' })).body.access_token;
    await request(app.getHttpServer()).post(endpoint).auth(otherToken, { type: 'bearer' }).send(input).expect(404);
    const invite = await post('/auth/users', { email: `hr-employee-${suffix}@example.test`, fullName: 'Employee user', roles: ['employee'] }).expect(201);
    await request(app.getHttpServer()).post('/auth/reset-password').send({ token: invite.body.activationToken, password: 'HrLifecycle123!' }).expect(201);
    const employeeToken = (await request(app.getHttpServer()).post('/auth/login').send({ email: `hr-employee-${suffix}@example.test`, password: 'HrLifecycle123!' })).body.access_token;
    await request(app.getHttpServer()).post(endpoint).auth(employeeToken, { type: 'bearer' }).send(input).expect(403);
    await patch(`/hr/employees/${leave.employee_id}`, { ...employee, expectedRevision: 0 }).expect(200);
    await post(endpoint, input).expect(201);
    await post(`/hr/leave-requests/${leave.id}/approve`, {}).expect(400);
    const rejectedEmployee = (await post('/hr/employees', { employeeCode: 'EMP-REJECT', fullName: 'Rejected request employee' })).body.id;
    const rejected = (await post('/hr/leave-requests', { employeeId: rejectedEmployee, startDate: '2026-04-01', endDate: '2026-04-01' })).body.id;
    await post(`/hr/leave-requests/${rejected}/reject`, { note: 'Rejected initially' }).expect(201);
    await post(`/hr/leave-requests/${rejected}/cancel`, { ...input, expectedRevision: 1 }).expect(409);
  });
});
