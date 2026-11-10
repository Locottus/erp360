import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CheckInInput, CheckOutInput, CreateEmployeeInput, LeaveRequestInput } from './hr.types';
import { HrService } from './hr.service';

@Controller('hr')
@UseGuards(AuthGuard)
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Post('employees')
  @Roles('admin')
  createEmployee(@Req() request: AuthenticatedRequest, @Body() body: CreateEmployeeInput) {
    return this.hrService.createEmployee(request.user, body);
  }

  @Get('employees')
  listEmployees(@Req() request: AuthenticatedRequest) {
    return this.hrService.listEmployees(request.user);
  }

  @Post('attendance/check-in')
  @Roles('admin')
  checkIn(@Req() request: AuthenticatedRequest, @Body() body: CheckInInput) {
    return this.hrService.checkIn(request.user, body);
  }

  @Post('attendance/check-out')
  @Roles('admin')
  checkOut(@Req() request: AuthenticatedRequest, @Body() body: CheckOutInput) {
    return this.hrService.checkOut(request.user, body);
  }

  @Post('leave-requests')
  @Roles('admin')
  createLeaveRequest(@Req() request: AuthenticatedRequest, @Body() body: LeaveRequestInput) {
    return this.hrService.createLeaveRequest(request.user, body);
  }

  @Post('leave-requests/:id/approve')
  @Roles('admin')
  approveLeaveRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') leaveRequestId: string,
    @Body() body: { note?: string },
  ) {
    return this.hrService.decideLeaveRequest(request.user, leaveRequestId, 'approved', body?.note);
  }

  @Post('leave-requests/:id/reject')
  @Roles('admin')
  rejectLeaveRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') leaveRequestId: string,
    @Body() body: { note?: string },
  ) {
    return this.hrService.decideLeaveRequest(request.user, leaveRequestId, 'rejected', body?.note);
  }

  @Get('leave-requests')
  listLeaveRequests(@Req() request: AuthenticatedRequest) {
    return this.hrService.listLeaveRequests(request.user);
  }
}
