import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { Role, User } from './models';

const TOKEN_KEY = 'rds.token';
const USER_KEY = 'rds.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(this.restoreUser());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly isAdmin = computed(() => ['ADMIN', 'MANAGER'].includes(this._user()?.role ?? ''));
  readonly canEdit = computed(() => ['ADMIN', 'MANAGER'].includes(this._user()?.role ?? ''));
  readonly canInvoice = computed(() => ['ADMIN', 'MANAGER', 'ACCOUNTING'].includes(this._user()?.role ?? ''));

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

  updateUser(patch: Partial<User>) {
    const current = this._user();
    if (!current) return;
    const next = { ...current, ...patch };
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    this._user.set(next);
  }

  hasRole(...roles: Role[]): boolean {
    const role = this._user()?.role;
    return !!role && roles.includes(role);
  }

  logout(redirect = true) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
    if (redirect) this.router.navigate(['/login']);
  }
}
