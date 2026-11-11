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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HrController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const hr_service_1 = require("./hr.service");
let HrController = class HrController {
    hrService;
    constructor(hrService) {
        this.hrService = hrService;
    }
    updateEmployee(request, id, input) {
        return this.hrService.updateEmployee(request.user, id, input);
    }
    correctAttendance(request, id, input) {
        return this.hrService.correctAttendance(request.user, id, input);
    }
    createEmployee(request, body) {
        return this.hrService.createEmployee(request.user, body);
    }
    listEmployees(request) {
        return this.hrService.listEmployees(request.user);
    }
    listAttendance(request, status) {
        return this.hrService.listAttendance(request.user, status);
    }
    checkIn(request, body) {
        return this.hrService.checkIn(request.user, body);
    }
    checkOut(request, body) {
        return this.hrService.checkOut(request.user, body);
    }
    createLeaveRequest(request, body) {
        return this.hrService.createLeaveRequest(request.user, body);
    }
    approveLeaveRequest(request, leaveRequestId, body) {
        return this.hrService.decideLeaveRequest(request.user, leaveRequestId, 'approved', body?.note);
    }
    rejectLeaveRequest(request, leaveRequestId, body) {
        return this.hrService.decideLeaveRequest(request.user, leaveRequestId, 'rejected', body?.note);
    }
    listLeaveRequests(request) {
        return this.hrService.listLeaveRequests(request.user);
    }
    cancelLeaveRequest(request, id, input) {
        return this.hrService.cancelLeaveRequest(request.user, id, input);
    }
};
exports.HrController = HrController;
__decorate([
    (0, common_1.Patch)('employees/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "updateEmployee", null);
__decorate([
    (0, common_1.Patch)('attendance/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "correctAttendance", null);
__decorate([
    (0, common_1.Post)('employees'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "createEmployee", null);
__decorate([
    (0, common_1.Get)('employees'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "listEmployees", null);
__decorate([
    (0, common_1.Get)('attendance'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "listAttendance", null);
__decorate([
    (0, common_1.Post)('attendance/check-in'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "checkIn", null);
__decorate([
    (0, common_1.Post)('attendance/check-out'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "checkOut", null);
__decorate([
    (0, common_1.Post)('leave-requests'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "createLeaveRequest", null);
__decorate([
    (0, common_1.Post)('leave-requests/:id/approve'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "approveLeaveRequest", null);
__decorate([
    (0, common_1.Post)('leave-requests/:id/reject'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "rejectLeaveRequest", null);
__decorate([
    (0, common_1.Get)('leave-requests'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "listLeaveRequests", null);
__decorate([
    (0, common_1.Post)('leave-requests/:id/cancel'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "cancelLeaveRequest", null);
exports.HrController = HrController = __decorate([
    (0, common_1.Controller)('hr'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [hr_service_1.HrService])
], HrController);
//# sourceMappingURL=hr.controller.js.map