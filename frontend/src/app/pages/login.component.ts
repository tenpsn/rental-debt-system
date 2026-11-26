import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/auth.interceptor';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-wrap">
      <section class="login-hero">
        <div class="hero-inner">
          <div class="brand" style="border:none;padding:0">
            <div class="brand-mark">R</div>
            <div class="brand-text"><b>Rental Debt</b><span>ระบบบันทึกและติดตามหนี้ค่าเช่าเครื่อง</span></div>
          </div>
          <h1>ติดตามทุกงวด ทุกใบแจ้งหนี้<br />และทุกเช็ค ในที่เดียว</h1>
          <p>
            ควบคุมการออกใบแจ้งหนี้ให้ครบทุกงวดตามสัญญา ติดตามการส่งเอกสารถึงผู้แทนและโรงพยาบาล
            พร้อมรายงานอายุหนี้และยอดคงเหลือในสัญญาแบบเรียลไทม์
          </p>
          <ul>
            <li>สรุปจำนวนงวดที่ยังไม่แจ้งหนี้ เทียบกับงวดทั้งหมดในสัญญา</li>
            <li>ตรวจสอบย้อนหลังได้ว่า ส่งใบแจ้งหนี้เมื่อไร วิธีใด ถึงใคร</li>
            <li>รายงานอายุหนี้ 30 / 60 / 90 วัน แยกตามผู้แทนและโรงพยาบาล</li>
          </ul>
        </div>
      </section>

      <section class="login-form-wrap">
        <form class="login-card" (ngSubmit)="submit()">
          <h2>เข้าสู่ระบบ</h2>
          <p class="muted small" style="margin:4px 0 20px">ใช้บัญชีที่ผู้ดูแลระบบออกให้</p>

          @if (expired() && !error()) {
            <div class="alert info" style="margin-bottom:14px">หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่อีกครั้ง</div>
          }
          @if (error()) {
            <div class="alert" style="margin-bottom:14px">{{ error() }}</div>
          }

          <div class="field" style="margin-bottom:12px">
            <label>อีเมล</label>
            <input name="email" type="email" [(ngModel)]="email" placeholder="name@company.co.th" autocomplete="username" required />
          </div>
          <div class="field" style="margin-bottom:8px">
            <label>รหัสผ่าน</label>
            <input name="password" type="password" [(ngModel)]="password" autocomplete="current-password" required />
          </div>

          <button class="btn primary" style="width:100%;margin-top:12px;padding:10px" [disabled]="loading()">
            {{ loading() ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ' }}
          </button>

          <div class="demo-box">
            <b>บัญชีตัวอย่าง</b>
            <div>ผู้ดูแลระบบ: admin&#64;medrental.co.th / Admin123!</div>
            <div>ผู้จัดการ: manager&#64;medrental.co.th / ChangeMe123!</div>
            <div>ฝ่ายบัญชี: accounting&#64;medrental.co.th / ChangeMe123!</div>
            <div>ผู้แทนพื้นที่: somchai&#64;medrental.co.th / ChangeMe123!</div>
          </div>
        </form>
      </section>
    </div>

    <style>
      .login-wrap { display: grid; grid-template-columns: 1.05fr .95fr; min-height: 100vh; }
      .login-hero {
        background: radial-gradient(1200px 600px at 20% 10%, #1c4a7d 0%, #0f2744 55%, #0b1c31 100%);
        color: #dbe6f3; display: flex; align-items: center; padding: 56px;
      }
      .hero-inner { max-width: 520px; }
      .hero-inner h1 { color: #fff; font-size: 30px; line-height: 1.35; margin: 34px 0 14px; }
      .hero-inner p { color: #a9bfd6; font-size: 14px; line-height: 1.75; }
      .hero-inner ul { margin: 22px 0 0; padding-left: 18px; color: #9fb8d1; font-size: 13px; line-height: 2; }
      .login-form-wrap { display: grid; place-items: center; padding: 32px; background: #f6f8fb; }
      .login-card { width: 100%; max-width: 380px; }
      .demo-box {
        margin-top: 22px; padding: 12px 14px; border: 1px dashed #cdd8e6; border-radius: 10px;
        font-size: 12px; color: var(--muted); background: #fbfcfe; line-height: 1.9;
      }
      .demo-box b { color: #34495f; display: block; margin-bottom: 2px; }
      @media (max-width: 900px) {
        .login-wrap { grid-template-columns: 1fr; }
        .login-hero { display: none; }
      }
    </style>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  // มาจากการหมดเวลาเข้าสู่ระบบ และหน้าที่จะพากลับไปหลังล็อกอิน
  readonly expired = signal(this.route.snapshot.queryParamMap.get('expired') === '1');
  private readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

  submit() {
    if (!this.email || !this.password) {
      this.error.set('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.loading.set(false);
        // กลับไปหน้าที่ค้างไว้ ถ้าเป็นที่อยู่ภายในระบบเท่านั้น
        const target = this.returnUrl && this.returnUrl.startsWith('/') && !this.returnUrl.startsWith('//') ? this.returnUrl : '/dashboard';
        this.router.navigateByUrl(target);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
