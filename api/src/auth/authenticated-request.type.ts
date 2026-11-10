import type { Request } from 'express';

export type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    companyId: string;
    roles: string[];
  };
};
