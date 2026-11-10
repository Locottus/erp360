import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CheckInInput, CheckOutInput, CreateEmployeeInput, LeaveRequestInput } from './hr.types';
import { HrService } from './hr.service';
export declare class HrController {
    private readonly hrService;
    constructor(hrService: HrService);
    createEmployee(request: AuthenticatedRequest, body: CreateEmployeeInput): Promise<{
        id: string;
        employee_code: string;
    }>;
    listEmployees(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
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
    listLeaveRequests(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
}
