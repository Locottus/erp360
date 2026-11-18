import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CheckInInput, CheckOutInput, CreateEmployeeInput, LeaveRequestInput } from './hr.types';
import { HrService } from './hr.service';
export declare class HrController {
    private readonly hrService;
    constructor(hrService: HrService);
    bindEmployeeAccount(request: AuthenticatedRequest, id: string, input: {
        userId: string;
        reason: string;
    }): Promise<{
        employeeId: string;
        userId: string;
        bindingStatus: string;
    }>;
    disableEmployeeAccount(request: AuthenticatedRequest, id: string, input: {
        reason: string;
    }): Promise<{
        employeeId: string;
        bindingStatus: string;
    }>;
    updateEmployee(request: AuthenticatedRequest, id: string, input: Parameters<HrService['updateEmployee']>[2]): Promise<{
        id: string;
        revision: number;
    }>;
    correctAttendance(request: AuthenticatedRequest, id: string, input: Parameters<HrService['correctAttendance']>[2]): Promise<{
        id: string;
        revision: number;
        totalMinutes: number;
    }>;
    createEmployee(request: AuthenticatedRequest, body: CreateEmployeeInput): Promise<{
        id: string;
        employee_code: string;
    }>;
    listEmployees(request: AuthenticatedRequest, page?: string, pageSize?: string): Promise<import("pg").QueryResultRow[] | {
        items: import("pg").QueryResultRow[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    listAttendance(request: AuthenticatedRequest, status?: string, page?: string, pageSize?: string): Promise<import("pg").QueryResultRow[] | {
        items: import("pg").QueryResultRow[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    checkIn(request: AuthenticatedRequest, body: CheckInInput): Promise<{
        id: string;
        employeeId: string;
        status: string;
    }>;
    checkOut(request: AuthenticatedRequest, body: CheckOutInput): Promise<{
        id: string;
        status: string;
        totalMinutes: number;
    }>;
    createLeaveRequest(request: AuthenticatedRequest, body: LeaveRequestInput): Promise<{
        id: string;
        status: string;
    }>;
    approveLeaveRequest(request: AuthenticatedRequest, leaveRequestId: string, body: {
        note?: string;
    }): Promise<{
        id: string;
        status: "approved" | "rejected";
    }>;
    rejectLeaveRequest(request: AuthenticatedRequest, leaveRequestId: string, body: {
        note?: string;
    }): Promise<{
        id: string;
        status: "approved" | "rejected";
    }>;
    listLeaveRequests(request: AuthenticatedRequest, page?: string, pageSize?: string): Promise<import("pg").QueryResultRow[] | {
        items: import("pg").QueryResultRow[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    cancelLeaveRequest(request: AuthenticatedRequest, id: string, input: Parameters<HrService['cancelLeaveRequest']>[2]): Promise<{
        id: string;
        status: string;
        revision: number;
    }>;
}
