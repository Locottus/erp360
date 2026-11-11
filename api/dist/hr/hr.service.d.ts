import { DatabaseService } from '../common/database.service';
import type { AuthUser, CheckInInput, CheckOutInput, CreateEmployeeInput, LeaveRequestInput } from './hr.types';
export declare class HrService {
    private readonly db;
    constructor(db: DatabaseService);
    createEmployee(user: AuthUser, input: CreateEmployeeInput): Promise<{
        id: string;
        employee_code: string;
    }>;
    listEmployees(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    listAttendance(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    checkIn(user: AuthUser, input: CheckInInput): Promise<{
        id: string;
        employeeId: string;
        status: string;
    }>;
    checkOut(user: AuthUser, input: CheckOutInput): Promise<{
        id: string;
        status: string;
        totalMinutes: number;
    }>;
    createLeaveRequest(user: AuthUser, input: LeaveRequestInput): Promise<{
        id: string;
        status: string;
    }>;
    decideLeaveRequest(user: AuthUser, leaveRequestId: string, decision: 'approved' | 'rejected', note?: string): Promise<{
        id: string;
        status: "approved" | "rejected";
    }>;
    listLeaveRequests(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    private assertEmployeeOwnership;
    private insertAuditTx;
    private insertAuditDirect;
}
