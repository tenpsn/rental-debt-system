import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();

  const request = token && req.url.startsWith('/api')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/login')) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};

export function errorMessage(error: unknown): string {
  const err = error as HttpErrorResponse;
  const body = err?.error;
  if (body?.error?.message) {
    const details = body.error.details;
    if (Array.isArray(details) && details.length) {
      return `${body.error.message}: ${details.map((d: { field: string; message: string }) => `${d.field} ${d.message}`).join(', ')}`;
    }
    return body.error.message;
  }
  if (err?.status === 0) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
  return err?.message || 'เกิดข้อผิดพลาด';
}
