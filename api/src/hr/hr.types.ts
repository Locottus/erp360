export type AuthUser = {
  sub: string;
  email: string;
  companyId: string;
  roles: string[];
};

export type CreateEmployeeInput = {
  employeeCode: string;
  fullName: string;
  email?: string;
  jobTitle?: string;
  hireDate?: string;
};

export type CheckInInput = {
  employeeId: string;
  checkInAt?: string;
};

export type CheckOutInput = {
  attendanceId: string;
  checkOutAt?: string;
};

export type LeaveRequestInput = {
  employeeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
};
