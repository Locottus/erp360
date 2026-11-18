import { DatabaseService } from '../common/database.service';
import type { AuthUser, CheckInInput, CheckOutInput, CreateEmployeeInput, LeaveRequestInput } from './hr.types';
export declare class HrService {
    private readonly db;
    constructor(db: DatabaseService);
    bindEmployeeAccount(user: AuthUser, employeeId: string, input: {
        userId: string;
        reason: string;
    }): Promise<{
        employeeId: string;
        userId: string;
        bindingStatus: string;
    }>;
    disableEmployeeAccount(user: AuthUser, employeeId: string, input: {
        reason: string;
    }): Promise<{
        employeeId: string;
        bindingStatus: string;
    }>;
    updateEmployee(user: AuthUser, id: string, input: {
        fullName: string;
        email?: string;
        jobTitle?: string;
        hireDate: string;
        status: string;
        expectedRevision: number;
        reason: string;
    }): Promise<{
        id: string;
        revision: number;
    }>;
    correctAttendance(user: AuthUser, id: string, input: {
        checkInAt: string;
        checkOutAt: string;
        expectedRevision: number;
        reason: string;
    }): Promise<{
        id: string;
        revision: number;
        totalMinutes: number;
    }>;
    private validateReason;
    private validateDate;
    private timestamp;
    private assertNoApprovedLeaveOverlap;
    createEmployee(user: AuthUser, input: CreateEmployeeInput): Promise<{
        id: string;
        employee_code: string;
    }>;
    listEmployees(user: AuthUser, options?: {
        page?: string;
        pageSize?: string;
    }): Promise<import("pg").QueryResultRow[] | {
        items: import("pg").QueryResultRow[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    listAttendance(user: AuthUser, status?: string, options?: {
        page?: string;
        pageSize?: string;
    }): Promise<import("pg").QueryResultRow[] | {
        items: import("pg").QueryResultRow[];
        total: number;
        page: number;
        pageSize: number;
    }>;
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
    cancelLeaveRequest(user: AuthUser, id: string, input: {
        reason: string;
        expectedRevision: number;
    }): Promise<{
        id: string;
        status: string;
        revision: number;
    }>;
    listLeaveRequests(user: AuthUser, options?: {
        page?: string;
        pageSize?: string;
    }): Promise<import("pg").QueryResultRow[] | {
        items: import("pg").QueryResultRow[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    private assertEmployeeOwnership;
    private insertAuditTx;
    private insertAuditDirect;
}
