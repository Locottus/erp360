import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api';
import { HelpService } from './help.service';
import { SessionService } from './session.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(`${API_BASE_URL}/`)) return next(request);
  const session = inject(SessionService);
  const help = inject(HelpService);
  const publicRequest = /\/(auth\/(login|bootstrap-admin|reset-password)|ecommerce\/storefront|portal\/public)(\/|$)/.test(request.url);
  const token = session.getAccessToken();
  const outgoing = token && !publicRequest
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;
  return next(outgoing).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse) {
      help.record(error.status, error.headers.get('x-correlation-id'));
      if (error.status === 401 && !publicRequest) session.logout();
    }
    return throwError(() => error);
  }));
};
