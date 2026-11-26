import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { User } from './models';

const TOKEN_KEY = 'rds.token';
const USER_KEY = 'rds.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(this.restoreUser());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  // สิทธิ์ฝั่งหน้าเว็บ ต้องตรงกับที่ backend อนุญาต
  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');
  readonly isRep = computed(() => this._user()?.role === 'REP');
  readonly canViewAudit = computed(() => ['ADMIN', 'MANAGER'].includes(this._user()?.role ?? ''));
  readonly canEdit = computed(() => ['ADMIN', 'MANAGER'].includes(this._user()?.role ?? ''));
  readonly canInvoice = computed(() => ['ADMIN', 'MANAGER', 'ACCOUNTING'].includes(this._user()?.role ?? ''));
  readonly canCancelInvoice = computed(() => ['ADMIN', 'ACCOUNTING'].includes(this._user()?.role ?? ''));
  readonly canDeleteAttachment = computed(() => ['ADMIN', 'MANAGER'].includes(this._user()?.role ?? ''));
  readonly canDeleteDelivery = computed(() => ['ADMIN', 'MANAGER'].includes(this._user()?.role ?? ''));

  constructor(private http: HttpClient, private router: Router) {}

  private restoreUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.http.post<{ token: string; user: User }>('/api/auth/login', { email, password }).pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_KEY, res.token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        this._user.set(res.user);
      }),
    );
  }

  // เปลี่ยนรหัสผ่านแล้ว token เดิมใช้ไม่ได้ ต้องเก็บ token ใหม่ที่ได้กลับมาแทน
  replaceToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  updateUser(patch: Partial<User>) {
    const current = this._user();
    if (!current) return;
    const next = { ...current, ...patch };
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    this._user.set(next);
  }

  // token หมดอายุหรือถูกยกเลิก พากลับหน้าเข้าสู่ระบบพร้อมบอกเหตุผล และจำหน้าเดิมไว้กลับมาหลังล็อกอิน
  // เรียกซ้ำพร้อมกันหลายครั้งได้ จะทำงานแค่ครั้งแรก
  expireSession(returnUrl: string) {
    if (!this._user() && !this.token()) return;
    this.logout(false);
    const safeReturn = returnUrl.startsWith('/') && !returnUrl.startsWith('/login') ? returnUrl : undefined;
    this.router.navigate(['/login'], { queryParams: { expired: 1, returnUrl: safeReturn } });
  }

  // อ่านเวลาหมดอายุจาก token ถ้าหมดแล้วไม่ต้องรอให้ API ตอบ 401
  isTokenExpired(): boolean {
    const token = this.token();
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  }

  logout(redirect = true) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
    if (redirect) this.router.navigate(['/login']);
  }
}
