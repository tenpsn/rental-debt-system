import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const token = auth.token();

  const request = token && req.url.startsWith('/api')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/login')) {
        // เข้าสู่ระบบหมดเวลา พากลับหน้าเข้าสู่ระบบพร้อมบอกเหตุผล
        auth.expireSession(router.url);
      } else if (req.method === 'GET') {
        // โหลดข้อมูลไม่สำเร็จ บอกผู้ใช้ทุกครั้ง หน้าจอจะได้ไม่ดูเหมือนแค่ไม่มีข้อมูล
        toast.error(`โหลดข้อมูลไม่สำเร็จ: ${errorMessage(error)}`);
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
