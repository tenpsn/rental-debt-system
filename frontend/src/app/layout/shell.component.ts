import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { filter, finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { errorMessage } from '../core/auth.interceptor';
import { ROLE_LABEL } from '../core/format';
import { ModalDirective } from '../core/modal.directive';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FormsModule, ModalDirective],
  template: `
    <div class="app-shell" [class.nav-open]="navOpen()">
      <!-- พื้นหลังมืดตอนเปิดเมนูบนจอเล็ก กดแล้วปิดเมนู -->
      <div class="nav-backdrop" (click)="navOpen.set(false)"></div>
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">R</div>
          <div class="brand-text">
            <b>Rental Debt</b>
            <span>ติดตามหนี้ค่าเช่าเครื่อง</span>
          </div>
        </div>

        <nav class="nav">
          <div class="nav-label">งานประจำวัน</div>
          <a routerLink="/dashboard" routerLinkActive="active"><span class="ic">◔</span> ภาพรวม</a>
          <a routerLink="/contracts" routerLinkActive="active"><span class="ic">▤</span> สัญญาเช่า</a>
          <a routerLink="/invoices" routerLinkActive="active"><span class="ic">▦</span> ใบแจ้งหนี้</a>
          <a routerLink="/cheques" routerLinkActive="active"><span class="ic">◈</span> เช็ค / รับชำระ</a>

          <div class="nav-label">วิเคราะห์</div>
          <a routerLink="/reports" routerLinkActive="active"><span class="ic">◫</span> รายงาน</a>
          <a routerLink="/hospitals" routerLinkActive="active"><span class="ic">⌂</span> โรงพยาบาล</a>

          @if (auth.canViewAudit()) {
            <div class="nav-label">ผู้ดูแลระบบ</div>
            @if (auth.isAdmin()) {
              <a routerLink="/users" routerLinkActive="active"><span class="ic">☺</span> ผู้ใช้งาน</a>
            }
            <a routerLink="/audit" routerLinkActive="active"><span class="ic">≡</span> บันทึกการใช้งาน</a>
          }
        </nav>

        <div class="sidebar-foot">
          เวอร์ชัน 1.0 · ข้อมูล ณ {{ today }}
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="row">
            <!-- ปุ่มเปิดเมนู แสดงเฉพาะจอเล็ก -->
            <button class="nav-toggle" aria-label="เปิดเมนู" (click)="navOpen.set(!navOpen())">☰</button>
            <div class="crumb">{{ title() }}</div>
          </div>
          <div class="who">
            <div class="avatar">{{ initials() }}</div>
            <div class="who-text">
              <div style="font-weight:600">{{ auth.user()?.fullName }}</div>
              <div class="small muted">{{ roleLabel() }}{{ auth.user()?.regionName ? ' · ' + auth.user()?.regionName : '' }}</div>
            </div>
            <button class="btn sm" (click)="menuOpen.set(!menuOpen())">บัญชี ▾</button>
          </div>
        </header>

        @if (menuOpen()) {
          <div style="position:fixed;right:12px;top:62px;z-index:50;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);padding:6px;min-width:200px">
            <button class="btn sm" style="width:100%;justify-content:flex-start;border:none" (click)="openPassword()">เปลี่ยนรหัสผ่าน</button>
            <button class="btn sm" style="width:100%;justify-content:flex-start;border:none;color:var(--red)" (click)="auth.logout()">ออกจากระบบ</button>
          </div>
        }

        <main class="content">
          <router-outlet />
        </main>
      </div>
    </div>

    @if (passwordOpen()) {
      <div class="modal-backdrop" appModal (dismiss)="passwordOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()" style="max-width:420px">
          <div class="modal-head"><h2>เปลี่ยนรหัสผ่าน</h2></div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label>รหัสผ่านปัจจุบัน</label><input type="password" [(ngModel)]="pw.current" /></div>
            <div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label><input type="password" [(ngModel)]="pw.next" /></div>
            <div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input type="password" [(ngModel)]="pw.confirm" /></div>
          </div>
          <div class="modal-foot">
            <button class="btn" (click)="passwordOpen.set(false)">ยกเลิก</button>
            <button class="btn primary" (click)="savePassword()" [disabled]="busy()">บันทึก</button>
          </div>
        </div>
      </div>
    }

    <div class="toast-wrap">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class.error]="t.tone === 'error'" [class.success]="t.tone === 'success'" (click)="toast.dismiss(t.id)">
          {{ t.text }}
        </div>
      }
    </div>
  `,
})
export class ShellComponent {
  // กันกดปุ่มบันทึกซ้ำระหว่างรอผล
  readonly busy = signal(false);
  readonly auth = inject(AuthService);
  private api = inject(ApiService);
  private toastSvc = inject(ToastService);
  readonly toast = this.toastSvc;
  private router = inject(Router);

  readonly menuOpen = signal(false);
  readonly navOpen = signal(false);
  readonly passwordOpen = signal(false);
  readonly title = signal('ภาพรวม');
  pw = { current: '', next: '', confirm: '' };

  readonly today = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  readonly initials = computed(() => (this.auth.user()?.fullName ?? '?').trim().charAt(0));
  readonly roleLabel = computed(() => ROLE_LABEL[this.auth.user()?.role ?? ''] ?? '');

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      let route = this.router.routerState.snapshot.root;
      while (route.firstChild) route = route.firstChild;
      this.title.set((route.data['title'] as string) ?? 'ภาพรวม');
      this.menuOpen.set(false);
      // เปลี่ยนหน้าแล้วปิดเมนูด้านข้างบนจอเล็ก
      this.navOpen.set(false);
    });
  }

  openPassword() {
    this.menuOpen.set(false);
    this.pw = { current: '', next: '', confirm: '' };
    this.passwordOpen.set(true);
  }

  savePassword() {
    if (this.pw.next.length < 8) return this.toastSvc.error('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
    if (this.pw.next !== this.pw.confirm) return this.toastSvc.error('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    if (this.busy()) return;
    this.busy.set(true);
    this.api.changePassword({ current_password: this.pw.current, new_password: this.pw.next }).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: (res) => {
        // token เดิมใช้ไม่ได้แล้ว เก็บ token ใหม่ไว้ใช้ต่อ
        this.auth.replaceToken(res.token);
        this.toastSvc.success('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นที่เข้าระบบไว้จะต้องเข้าสู่ระบบใหม่');
        this.passwordOpen.set(false);
      },
      error: (e) => this.toastSvc.error(errorMessage(e)),
    });
  }
}
