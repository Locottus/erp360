export type AuthUser = {
  sub: string;
  email: string;
  companyId: string;
  roles: string[];
};

export type CreatePortalTokenInput = {
  customerId: string;
  expiresInDays?: number;
};
