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
    async updateEmployee(user, id, input) {
        if (typeof input.fullName !== 'string' || !input.fullName.trim() || input.fullName.length > 200 ||
            !['active', 'inactive'].includes(input.status) || !Number.isInteger(input.expectedRevision) ||
            (input.email !== undefined && (typeof input.email !== 'string' || (input.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)))) ||
            (input.jobTitle !== undefined && (typeof input.jobTitle !== 'string' || input.jobTitle.length > 120))) {
            throw new common_1.BadRequestException('Employee details or revision are invalid.');
        }
        this.validateDate(input.hireDate);
        this.validateReason(input.reason);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const current = await client.query('SELECT revision FROM hr_employees WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
            if (!current.rows[0])
                throw new common_1.NotFoundException('Employee not found.');
            if (current.rows[0].revision !== input.expectedRevision)
                throw new common_1.ConflictException('Employee changed. Reload before editing.');
            if (input.status === 'inactive') {
                const open = await client.query(`SELECT id FROM hr_attendance WHERE company_id=$1 AND employee_id=$2 AND status='open'`, [user.companyId, id]);
                if (open.rows.length)
                    throw new common_1.BadRequestException('Close open attendance before deactivating the employee.');
            }
            await client.query(`UPDATE hr_employees SET full_name=$1,email=$2,job_title=$3,hire_date=$4,status=$5,revision=revision+1,updated_at=NOW()
         WHERE id=$6 AND company_id=$7`, [input.fullName.trim(), input.email?.trim().toLowerCase() || null, input.jobTitle?.trim() || null, input.hireDate, input.status, id, user.companyId]);
            await this.insertAuditTx(client, user, 'hr.employee.update', id, { reason: input.reason.trim(), from_revision: input.expectedRevision, status: input.status });
            await client.query('COMMIT');
            return { id, revision: input.expectedRevision + 1 };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async correctAttendance(user, id, input) {
        this.validateReason(input.reason);
        const start = this.timestamp(input.checkInAt);
        const end = this.timestamp(input.checkOutAt);
        if (end <= start || !Number.isInteger(input.expectedRevision))
            throw new common_1.BadRequestException('Valid ordered timestamps and revision are required.');
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const identity = await client.query('SELECT employee_id FROM hr_attendance WHERE id=$1 AND company_id=$2', [id, user.companyId]);
            if (!identity.rows[0])
                throw new common_1.NotFoundException('Attendance not found.');
            await client.query('SELECT id FROM hr_employees WHERE id=$1 AND company_id=$2 FOR UPDATE', [identity.rows[0].employee_id, user.companyId]);
            const current = await client.query('SELECT revision,status,check_in_at,check_out_at FROM hr_attendance WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
            if (current.rows[0].revision !== input.expectedRevision)
                throw new common_1.ConflictException('Attendance changed. Reload before correcting.');
            if (current.rows[0].status !== 'closed')
                throw new common_1.BadRequestException('Close attendance before applying an audited correction.');
            const overlap = await client.query(`SELECT id FROM hr_attendance WHERE company_id=$1 AND employee_id=$2 AND id<>$3
         AND check_in_at<$5 AND COALESCE(check_out_at,'infinity'::timestamptz)>$4`, [user.companyId, identity.rows[0].employee_id, id, start.toISOString(), end.toISOString()]);
            if (overlap.rows.length)
                throw new common_1.BadRequestException('Attendance correction overlaps another attendance.');
            await this.assertNoApprovedLeaveOverlap(client, user.companyId, identity.rows[0].employee_id, start, end);
            const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
            await client.query('UPDATE hr_attendance SET check_in_at=$1,check_out_at=$2,total_minutes=$3,revision=revision+1 WHERE id=$4 AND company_id=$5', [start.toISOString(), end.toISOString(), totalMinutes, id, user.companyId]);
            await this.insertAuditTx(client, user, 'hr.attendance.correct', id, {
                reason: input.reason.trim(), before: { check_in_at: current.rows[0].check_in_at, check_out_at: current.rows[0].check_out_at },
                after: { check_in_at: start.toISOString(), check_out_at: end.toISOString() },
            });
            await client.query('COMMIT');
            return { id, revision: input.expectedRevision + 1, totalMinutes };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    validateReason(reason) {
        if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000)
            throw new common_1.BadRequestException('A reason of 10 to 1000 characters is required.');
    }
    validateDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
            throw new common_1.BadRequestException('A valid date YYYY-MM-DD is required.');
        }
    }
    timestamp(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
            throw new common_1.BadRequestException('An ISO timestamp with explicit timezone is required.');
        }
        this.validateDate(value.slice(0, 10));
        return new Date(value);
    }
    async assertNoApprovedLeaveOverlap(client, companyId, employeeId, start, end) {
        const leave = await client.query(`SELECT id FROM hr_leave_requests WHERE company_id=$1 AND employee_id=$2 AND status='approved'
       AND (start_date::timestamp AT TIME ZONE 'UTC')<$4 AND ((end_date+1)::timestamp AT TIME ZONE 'UTC')>$3`, [companyId, employeeId, start.toISOString(), end.toISOString()]);
        if (leave.rows.length)
            throw new common_1.BadRequestException('Attendance overlaps approved leave (UTC calendar).');
    }
    async createEmployee(user, input) {
        if (typeof input.employeeCode !== 'string' || !input.employeeCode.trim() || input.employeeCode.length > 64 ||
            typeof input.fullName !== 'string' || !input.fullName.trim() || input.fullName.length > 200 ||
            (input.email !== undefined && (typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) ||
            (input.jobTitle !== undefined && (typeof input.jobTitle !== 'string' || input.jobTitle.length > 120))) {
            throw new common_1.BadRequestException('employeeCode and fullName are required.');
        }
        if (input.hireDate !== undefined)
            this.validateDate(input.hireDate);
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
        const result = await this.db.query(`SELECT id, employee_code, full_name, email, job_title, hire_date, status, revision, created_at
       FROM hr_employees
       WHERE company_id = $1
       ORDER BY full_name ASC`, [user.companyId]);
        await this.insertAuditDirect(user, 'hr.employee.list', user.companyId, { total: result.rows.length });
        return result.rows;
    }
    async listAttendance(user, status) {
        if (status !== undefined && status !== 'open') {
            throw new common_1.BadRequestException('Only the open attendance status can be filtered.');
        }
        const result = await this.db.query(`SELECT a.id, a.employee_id, e.employee_code, e.full_name, e.job_title,
              a.check_in_at, a.check_out_at, a.total_minutes, a.status, a.revision
       FROM hr_attendance a
       JOIN hr_employees e ON e.id = a.employee_id AND e.company_id = a.company_id
       WHERE a.company_id = $1 AND ($2::text IS NULL OR a.status = $2)
       ORDER BY a.check_in_at DESC, a.id DESC
       LIMIT CASE WHEN $2::text IS NULL THEN 500 ELSE NULL END`, [user.companyId, status ?? null]);
        await this.insertAuditDirect(user, 'hr.attendance.list', user.companyId, { total: result.rows.length, status: status ?? null });
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
            const start = this.timestamp(checkInAt);
            const overlap = await client.query(`SELECT id FROM hr_attendance WHERE company_id=$1 AND employee_id=$2
         AND (check_out_at IS NULL OR check_out_at>$3)`, [user.companyId, input.employeeId, start.toISOString()]);
            if (overlap.rows.length)
                throw new common_1.BadRequestException('Check-in overlaps an existing attendance.');
            const leave = await client.query(`SELECT id FROM hr_leave_requests WHERE company_id=$1 AND employee_id=$2 AND status='approved'
         AND start_date<=($3::timestamptz AT TIME ZONE 'UTC')::date AND end_date>=($3::timestamptz AT TIME ZONE 'UTC')::date`, [user.companyId, input.employeeId, start.toISOString()]);
            if (leave.rows.length)
                throw new common_1.BadRequestException('Check-in falls on approved leave (UTC calendar).');
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
            const identity = await client.query('SELECT employee_id FROM hr_attendance WHERE id=$1 AND company_id=$2', [input.attendanceId, user.companyId]);
            if (!identity.rows[0])
                throw new common_1.NotFoundException('Attendance not found.');
            await client.query('SELECT id FROM hr_employees WHERE id=$1 AND company_id=$2 FOR UPDATE', [identity.rows[0].employee_id, user.companyId]);
            const attendance = await client.query(`SELECT id, check_in_at, status
         FROM hr_attendance
         WHERE id = $1 AND company_id = $2
         LIMIT 1 FOR UPDATE`, [input.attendanceId, user.companyId]);
            if (!attendance.rows[0]) {
                throw new common_1.NotFoundException('Attendance not found.');
            }
            if (attendance.rows[0].status !== 'open') {
                throw new common_1.BadRequestException('Attendance is already closed.');
            }
            const checkOutAt = this.timestamp(input.checkOutAt ?? new Date().toISOString());
            const checkInAt = new Date(attendance.rows[0].check_in_at);
            if (checkOutAt <= checkInAt)
                throw new common_1.BadRequestException('Check-out must follow check-in.');
            await this.assertNoApprovedLeaveOverlap(client, user.companyId, identity.rows[0].employee_id, checkInAt, checkOutAt);
            const totalMinutes = Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
            await client.query(`UPDATE hr_attendance
         SET check_out_at = $1, total_minutes = $2, status = 'closed', revision=revision+1
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
        this.validateDate(input.startDate);
        this.validateDate(input.endDate);
        if (input.reason !== undefined && (typeof input.reason !== 'string' || input.reason.length > 1000))
            throw new common_1.BadRequestException('Leave reason must not exceed 1000 characters.');
        if (new Date(input.endDate) < new Date(input.startDate)) {
            throw new common_1.BadRequestException('endDate cannot be earlier than startDate.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await this.assertEmployeeOwnership(client, user.companyId, input.employeeId);
            const overlap = await client.query(`SELECT id FROM hr_leave_requests WHERE company_id=$1 AND employee_id=$2 AND status IN ('requested','approved')
       AND start_date<=$4 AND end_date>=$3`, [user.companyId, input.employeeId, input.startDate, input.endDate]);
            if (overlap.rows.length)
                throw new common_1.ConflictException('Leave dates overlap another pending or approved request.');
            const result = await client.query(`INSERT INTO hr_leave_requests
        (company_id, employee_id, start_date, end_date, reason, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'requested',$6)
       RETURNING id`, [user.companyId, input.employeeId, input.startDate, input.endDate, input.reason ?? null, user.sub]);
            await this.insertAuditTx(client, user, 'hr.leave.request.create', result.rows[0].id, {
                employee_id: input.employeeId,
                start_date: input.startDate,
                end_date: input.endDate,
            });
            await client.query('COMMIT');
            return { id: result.rows[0].id, status: 'requested' };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async decideLeaveRequest(user, leaveRequestId, decision, note) {
        if (note !== undefined && (typeof note !== 'string' || note.length > 1000))
            throw new common_1.BadRequestException('Decision note is too long.');
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const source = await client.query('SELECT employee_id FROM hr_leave_requests WHERE id=$1 AND company_id=$2', [leaveRequestId, user.companyId]);
            if (!source.rows[0])
                throw new common_1.NotFoundException('Leave request not found.');
            if (decision === 'approved')
                await this.assertEmployeeOwnership(client, user.companyId, source.rows[0].employee_id);
            else
                await client.query('SELECT id FROM hr_employees WHERE id=$1 AND company_id=$2 FOR UPDATE', [source.rows[0].employee_id, user.companyId]);
            if (decision === 'approved') {
                const attendance = await client.query(`SELECT a.id FROM hr_attendance a JOIN hr_leave_requests lr ON lr.employee_id=a.employee_id AND lr.company_id=a.company_id
           WHERE lr.id=$1 AND lr.company_id=$2 AND a.check_in_at<((lr.end_date+1)::timestamp AT TIME ZONE 'UTC')
             AND COALESCE(a.check_out_at,'infinity'::timestamptz)>(lr.start_date::timestamp AT TIME ZONE 'UTC')`, [leaveRequestId, user.companyId]);
                if (attendance.rows.length)
                    throw new common_1.BadRequestException('Leave overlaps attendance. Reconcile attendance before approval.');
            }
            const result = await client.query(`UPDATE hr_leave_requests SET status=$1,decision_note=$2,decided_by=$3,decided_at=NOW(),revision=revision+1
         WHERE id=$4 AND company_id=$5 AND status='requested' RETURNING id`, [decision, note ?? null, user.sub, leaveRequestId, user.companyId]);
            if (!result.rows[0])
                throw new common_1.NotFoundException('Leave request not found or already decided.');
            await this.insertAuditTx(client, user, `hr.leave.request.${decision}`, leaveRequestId, { decision_note: note ?? null });
            await client.query('COMMIT');
            return { id: leaveRequestId, status: decision };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async cancelLeaveRequest(user, id, input) {
        if (!input || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0)
            throw new common_1.BadRequestException('A nonnegative revision is required.');
        this.validateReason(input.reason);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const source = await client.query('SELECT employee_id FROM hr_leave_requests WHERE id=$1 AND company_id=$2', [id, user.companyId]);
            if (!source.rows[0])
                throw new common_1.NotFoundException('Leave request not found.');
            await client.query('SELECT id FROM hr_employees WHERE id=$1 AND company_id=$2 FOR UPDATE', [source.rows[0].employee_id, user.companyId]);
            const current = await client.query('SELECT status,revision,start_date::text,end_date::text FROM hr_leave_requests WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
            const leave = current.rows[0];
            if (leave.revision !== input.expectedRevision)
                throw new common_1.ConflictException('Leave changed. Reload before cancelling.');
            if (!['requested', 'approved'].includes(leave.status))
                throw new common_1.ConflictException('Only pending or approved leave may be cancelled.');
            await client.query(`UPDATE hr_leave_requests SET status='cancelled',revision=revision+1,cancelled_by=$1,cancelled_at=NOW(),cancellation_reason=$2
         WHERE id=$3 AND company_id=$4`, [user.sub, input.reason.trim(), id, user.companyId]);
            await this.insertAuditTx(client, user, 'hr.leave.request.cancelled', id, { reason: input.reason.trim(), before: leave, after: { status: 'cancelled', revision: leave.revision + 1 } });
            await client.query('COMMIT');
            return { id, status: 'cancelled', revision: leave.revision + 1 };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
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
              lr.revision,
              lr.cancelled_at,
              lr.cancellation_reason,
              lr.created_at
       FROM hr_leave_requests lr
       JOIN hr_employees he ON he.id = lr.employee_id
       WHERE lr.company_id = $1
       ORDER BY lr.created_at DESC`, [user.companyId]);
        await this.insertAuditDirect(user, 'hr.leave.request.list', user.companyId, { total: result.rows.length });
        return result.rows;
    }
    async assertEmployeeOwnership(client, companyId, employeeId) {
        const employee = await client.query(`SELECT id,status
       FROM hr_employees
       WHERE id = $1 AND company_id = $2
       LIMIT 1 FOR UPDATE`, [employeeId, companyId]);
        if (!employee.rows[0]) {
            throw new common_1.BadRequestException('Employee does not belong to current company.');
        }
        if (employee.rows[0].status !== 'active')
            throw new common_1.BadRequestException('Employee is inactive.');
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