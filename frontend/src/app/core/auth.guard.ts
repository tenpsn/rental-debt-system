import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  // token หมดอายุแล้ว ไม่ต้องเปิดหน้าแล้วค่อยเด้งออก
  if (auth.isTokenExpired()) {
    auth.logout(false);
    return router.createUrlTree(['/login'], { queryParams: { expired: 1, returnUrl: state.url } });
  }
  return true;
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAdmin() ? true : router.createUrlTree(['/dashboard']);
};

// หน้าสร้างสัญญา เปิดได้เฉพาะคนที่มีสิทธิ์แก้สัญญา
export const editorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.canEdit() ? true : router.createUrlTree(['/contracts']);
};

// หน้าบันทึกการใช้งาน เปิดได้ทั้งผู้ดูแลระบบและผู้จัดการ
export const auditGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.canViewAudit() ? true : router.createUrlTree(['/dashboard']);
};
