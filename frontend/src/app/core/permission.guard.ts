import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

export const permissionGuard: CanActivateFn = (route) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const permissions = (route.data['permissions'] as string[] | undefined) ?? [];
  if (!permissions.length) return true;
  if (!session.isAuthenticated()) return router.createUrlTree(['/login']);
  return session.hasAnyPermission(...permissions)
    ? true
    : router.createUrlTree(['/']);
};
