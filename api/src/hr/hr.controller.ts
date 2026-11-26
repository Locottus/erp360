import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type {
  CheckInInput,
  CheckOutInput,
  CreateEmployeeInput,
  LeaveRequestInput,
} from './hr.types';
import { HrService } from './hr.service';

@Controller('hr')
@UseGuards(AuthGuard)
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Post('employees/:id/account-binding')
  @Roles('admin')
  @Permissions('hr.manage')
  bindEmployeeAccount(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: { userId: string; reason: string },
  ) {
    return this.hrService.bindEmployeeAccount(request.user, id, input);
  }

  @Post('employees/:id/account-binding/disable')
  @Roles('admin')
  @Permissions('hr.manage')
  disableEmployeeAccount(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: { reason: string },
  ) {
    return this.hrService.disableEmployeeAccount(request.user, id, input);
  }

  @Patch('employees/:id')
  @Roles('admin')
  @Permissions('hr.manage')
  updateEmployee(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Parameters<HrService['updateEmployee']>[2],
  ) {
    return this.hrService.updateEmployee(request.user, id, input);
  }

  @Patch('attendance/:id')
  @Roles('admin')
  @Permissions('hr.manage')
  correctAttendance(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Parameters<HrService['correctAttendance']>[2],
  ) {
    return this.hrService.correctAttendance(request.user, id, input);
  }

  @Post('employees')
  @Roles('admin')
  @Permissions('hr.manage')
  createEmployee(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateEmployeeInput,
  ) {
    return this.hrService.createEmployee(request.user, body);
  }

  @Get('employees')
  @Roles('admin')
  @Permissions('hr.read')
  listEmployees(
    @Req() request: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.hrService.listEmployees(request.user, { page, pageSize });
  }

  @Get('attendance')
  @Roles('admin')
  @Permissions('hr.read')
  listAttendance(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.hrService.listAttendance(request.user, status, {
      page,
      pageSize,
    });
  }

  @Post('attendance/check-in')
  @Roles('admin')
  @Permissions('hr.manage')
  checkIn(@Req() request: AuthenticatedRequest, @Body() body: CheckInInput) {
    return this.hrService.checkIn(request.user, body);
  }

  @Post('attendance/check-out')
  @Roles('admin')
  @Permissions('hr.manage')
  checkOut(@Req() request: AuthenticatedRequest, @Body() body: CheckOutInput) {
    return this.hrService.checkOut(request.user, body);
  }

  @Post('leave-requests')
  @Roles('admin')
  @Permissions('hr.manage')
  createLeaveRequest(
    @Req() request: AuthenticatedRequest,
    @Body() body: LeaveRequestInput,
  ) {
    return this.hrService.createLeaveRequest(request.user, body);
  }

  @Post('leave-requests/:id/approve')
  @Roles('admin')
  @Permissions('hr.manage')
  approveLeaveRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') leaveRequestId: string,
    @Body() body: { note?: string },
  ) {
    return this.hrService.decideLeaveRequest(
      request.user,
      leaveRequestId,
      'approved',
      body?.note,
    );
  }

  @Post('leave-requests/:id/reject')
  @Roles('admin')
  @Permissions('hr.manage')
  rejectLeaveRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') leaveRequestId: string,
    @Body() body: { note?: string },
  ) {
    return this.hrService.decideLeaveRequest(
      request.user,
      leaveRequestId,
      'rejected',
      body?.note,
    );
  }

  @Get('leave-requests')
  @Roles('admin')
  @Permissions('hr.read')
  listLeaveRequests(
    @Req() request: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.hrService.listLeaveRequests(request.user, { page, pageSize });
  }

  @Post('leave-requests/:id/cancel')
  @Roles('admin')
  @Permissions('hr.manage')
  cancelLeaveRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Parameters<HrService['cancelLeaveRequest']>[2],
  ) {
    return this.hrService.cancelLeaveRequest(request.user, id, input);
  }
}
