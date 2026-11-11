"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HrService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
let HrService = class HrService {
    db;
    constructor(db) {
        this.db = db;
    }
    async createEmployee(user, input) {
        if (!input.employeeCode?.trim() || !input.fullName?.trim()) {
            throw new common_1.BadRequestException('employeeCode and fullName are required.');
        }
        try {
            const result = await this.db.query(`INSERT INTO hr_employees
          (company_id, employee_code, full_name, email, job_title, hire_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'active',$7)
         RETURNING id, employee_code`, [
                user.companyId,
                input.employeeCode.trim(),
                input.fullName.trim(),
                input.email ?? null,
                input.jobTitle ?? null,
                input.hireDate ?? new Date().toISOString().slice(0, 10),
                user.sub,
            ]);
            await this.insertAuditDirect(user, 'hr.employee.create', result.rows[0].id, {
                employee_code: input.employeeCode,
            });
            return result.rows[0];
        }
        catch (error) {
            if (String(error).includes('hr_employees_company_id_employee_code_key')) {
                throw new common_1.ConflictException('employeeCode already exists for this company.');
            }
            throw error;
        }
    }
    async listEmployees(user) {
        const result = await this.db.query(`SELECT id, employee_code, full_name, email, job_title, hire_date, status, created_at
       FROM hr_employees
       WHERE company_id = $1
       ORDER BY full_name ASC`, [user.companyId]);
        await this.insertAuditDirect(user, 'hr.employee.list', user.companyId, { total: result.rows.length });
        return result.rows;
    }
    async listAttendance(user) {
        const result = await this.db.query(`SELECT a.id, a.employee_id, e.employee_code, e.full_name, e.job_title,
              a.check_in_at, a.check_out_at, a.total_minutes, a.status
       FROM hr_attendance a
       JOIN hr_employees e ON e.id = a.employee_id AND e.company_id = a.company_id
       WHERE a.company_id = $1
       ORDER BY a.check_in_at DESC, a.id DESC
       LIMIT 500`, [user.companyId]);
        await this.insertAuditDirect(user, 'hr.attendance.list', user.companyId, { total: result.rows.length });
        return result.rows;
    }
    async checkIn(user, input) {
        if (!input.employeeId?.trim()) {
            throw new common_1.BadRequestException('employeeId is required.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await this.assertEmployeeOwnership(client, user.companyId, input.employeeId);
            const existing = await client.query(`SELECT id
         FROM hr_attendance
         WHERE company_id = $1 AND employee_id = $2 AND status = 'open'
         LIMIT 1`, [user.companyId, input.employeeId]);
            if (existing.rows[0]) {
                throw new common_1.BadRequestException('Employee already has an open attendance.');
            }
            const checkInAt = input.checkInAt ?? new Date().toISOString();
            const result = await client.query(`INSERT INTO hr_attendance (company_id, employee_id, check_in_at, status, created_by)
         VALUES ($1,$2,$3,'open',$4)
         RETURNING id`, [user.companyId, input.employeeId, checkInAt, user.sub]);
            await this.insertAuditTx(client, user, 'hr.attendance.check_in', result.rows[0].id, {
                employee_id: input.employeeId,
            });
            await client.query('COMMIT');
            return { id: result.rows[0].id, employeeId: input.employeeId, status: 'open' };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async checkOut(user, input) {
        if (!input.attendanceId?.trim()) {
            throw new common_1.BadRequestException('attendanceId is required.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const attendance = await client.query(`SELECT id, check_in_at, status
         FROM hr_attendance
         WHERE id = $1 AND company_id = $2
         LIMIT 1`, [input.attendanceId, user.companyId]);
            if (!attendance.rows[0]) {
                throw new common_1.NotFoundException('Attendance not found.');
            }
            if (attendance.rows[0].status !== 'open') {
                throw new common_1.BadRequestException('Attendance is already closed.');
            }
            const checkOutAt = new Date(input.checkOutAt ?? new Date().toISOString());
            const checkInAt = new Date(attendance.rows[0].check_in_at);
            const totalMinutes = Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000));
            await client.query(`UPDATE hr_attendance
         SET check_out_at = $1, total_minutes = $2, status = 'closed'
         WHERE id = $3`, [checkOutAt.toISOString(), totalMinutes, input.attendanceId]);
            await this.insertAuditTx(client, user, 'hr.attendance.check_out', input.attendanceId, {
                total_minutes: totalMinutes,
            });
            await client.query('COMMIT');
            return { id: input.attendanceId, status: 'closed', totalMinutes };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async createLeaveRequest(user, input) {
        if (!input.employeeId?.trim() || !input.startDate?.trim() || !input.endDate?.trim()) {
            throw new common_1.BadRequestException('employeeId, startDate and endDate are required.');
        }
        if (new Date(input.endDate) < new Date(input.startDate)) {
            throw new common_1.BadRequestException('endDate cannot be earlier than startDate.');
        }
        const employee = await this.db.query(`SELECT id
       FROM hr_employees
       WHERE id = $1 AND company_id = $2
       LIMIT 1`, [input.employeeId, user.companyId]);
        if (!employee.rows[0]) {
            throw new common_1.BadRequestException('Employee does not belong to current company.');
        }
        const result = await this.db.query(`INSERT INTO hr_leave_requests
        (company_id, employee_id, start_date, end_date, reason, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'requested',$6)
       RETURNING id`, [user.companyId, input.employeeId, input.startDate, input.endDate, input.reason ?? null, user.sub]);
        await this.insertAuditDirect(user, 'hr.leave.request.create', result.rows[0].id, {
            employee_id: input.employeeId,
            start_date: input.startDate,
            end_date: input.endDate,
        });
        return { id: result.rows[0].id, status: 'requested' };
    }
    async decideLeaveRequest(user, leaveRequestId, decision, note) {
        const result = await this.db.query(`UPDATE hr_leave_requests
       SET status = $1, decision_note = $2, decided_by = $3, decided_at = NOW()
       WHERE id = $4 AND company_id = $5 AND status = 'requested'
       RETURNING id`, [decision, note ?? null, user.sub, leaveRequestId, user.companyId]);
        if (!result.rows[0]) {
            throw new common_1.NotFoundException('Leave request not found or already decided.');
        }
        await this.insertAuditDirect(user, `hr.leave.request.${decision}`, leaveRequestId, {
            decision_note: note ?? null,
        });
        return { id: leaveRequestId, status: decision };
    }
    async listLeaveRequests(user) {
        const result = await this.db.query(`SELECT lr.id,
              lr.employee_id,
              he.employee_code,
              he.full_name,
              lr.start_date,
              lr.end_date,
              lr.reason,
              lr.status,
              lr.decision_note,
              lr.decided_at,
              lr.created_at
       FROM hr_leave_requests lr
       JOIN hr_employees he ON he.id = lr.employee_id
       WHERE lr.company_id = $1
       ORDER BY lr.created_at DESC`, [user.companyId]);
        await this.insertAuditDirect(user, 'hr.leave.request.list', user.companyId, { total: result.rows.length });
        return result.rows;
    }
    async assertEmployeeOwnership(client, companyId, employeeId) {
        const employee = await client.query(`SELECT id
       FROM hr_employees
       WHERE id = $1 AND company_id = $2
       LIMIT 1`, [employeeId, companyId]);
        if (!employee.rows[0]) {
            throw new common_1.BadRequestException('Employee does not belong to current company.');
        }
    }
    async insertAuditTx(client, user, eventName, entityId, payload) {
        await client.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [user.companyId, user.sub, eventName, 'hr', entityId, JSON.stringify(payload)]);
    }
    async insertAuditDirect(user, eventName, entityId, payload) {
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [user.companyId, user.sub, eventName, 'hr', entityId, JSON.stringify(payload)]);
    }
};
exports.HrService = HrService;
exports.HrService = HrService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], HrService);
//# sourceMappingURL=hr.service.js.map