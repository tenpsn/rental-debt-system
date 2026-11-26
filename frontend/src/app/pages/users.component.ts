import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { errorMessage } from '../core/auth.interceptor';
import { Region, User } from '../core/models';
import { ROLE_LABEL, ROLE_TONE, thaiDateTime } from '../core/format';
import { ModalDirective } from '../core/modal.directive';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalDirective],
  template: `
    <div class="page-head">
      <div>
        <h1>ผู้ใช้งาน</h1>
        <p>ผู้แทนพื้นที่เห็นเฉพาะโรงพยาบาลและสัญญาในพื้นที่ของตนเอง</p>
      </div>
      <button class="btn primary" (click)="openCreate()">+ เพิ่มผู้ใช้</button>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th><th>ภาค</th><th class="num">รพ. ที่ดูแล</th><th>เข้าใช้ล่าสุด</th><th>สถานะ</th><th></th></tr>
          </thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr>
                <td><b>{{ u.fullName }}</b><div class="small muted">{{ u.phone || '' }}</div></td>
                <td class="small">{{ u.email }}</td>
                <td><span [class]="'chip ' + roleTone(u.role)">{{ roleLabel(u.role) }}</span></td>
                <td class="small">{{ u.regionName || 'ทั้งประเทศ' }}</td>
                <td class="num">{{ u.hospitalCount ?? '—' }}</td>
                <td class="small muted">{{ u.lastLoginAt ? thaiDateTime(u.lastLoginAt) : 'ยังไม่เข้าใช้' }}</td>
                <td>
                  <span class="chip" [class.green]="u.isActive" [class.red]="!u.isActive">{{ u.isActive ? 'ใช้งาน' : 'ปิด' }}</span>
                </td>
                <td class="num"><button class="btn sm" (click)="openEdit(u)">แก้ไข</button></td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="empty">ไม่พบผู้ใช้</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" appModal (dismiss)="formOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head"><h2>{{ editingId() ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้' }}</h2></div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label>ชื่อ-นามสกุล *</label><input [(ngModel)]="form.fullName" /></div>
            <div class="field"><label>อีเมล *</label><input type="email" [(ngModel)]="form.email" [disabled]="!!editingId()" /></div>
            <div class="grid grid-2">
              <div class="field">
                <label>บทบาท</label>
                <select [(ngModel)]="form.role">
                  <option value="REP">ผู้แทนพื้นที่</option>
                  <option value="ACCOUNTING">ฝ่ายบัญชี</option>
                  <option value="MANAGER">ผู้จัดการ</option>
                  <option value="ADMIN">ผู้ดูแลระบบ</option>
                </select>
              </div>
              <div class="field">
                <label>ภาค</label>
                <select [(ngModel)]="form.regionId">
                  <option [ngValue]="null">— ทั้งประเทศ —</option>
                  @for (r of regions(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
                </select>
              </div>
            </div>
            <div class="grid grid-2">
              <div class="field"><label>โทรศัพท์</label><input [(ngModel)]="form.phone" /></div>
              <div class="field">
                <label>{{ editingId() ? 'รหัสผ่านใหม่ (ถ้าต้องการเปลี่ยน)' : 'รหัสผ่าน *' }}</label>
                <input type="password" [(ngModel)]="form.password" placeholder="อย่างน้อย 8 ตัวอักษร" />
              </div>
            </div>
            <label class="row small" style="gap:6px"><input type="checkbox" [(ngModel)]="form.isActive" /> เปิดใช้งานบัญชี</label>
          </div>
          <div class="modal-foot">
            <button class="btn" (click)="formOpen.set(false)">ยกเลิก</button>
            <button class="btn primary" (click)="save()" [disabled]="busy()">บันทึก</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UsersComponent {
  // กันกดปุ่มบันทึกซ้ำระหว่างรอผล
  readonly busy = signal(false);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly users = signal<User[]>([]);
  readonly regions = signal<Region[]>([]);
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);

  form = this.blank();

  readonly roleLabel = (r: string) => ROLE_LABEL[r] ?? r;
  readonly roleTone = (r: string) => ROLE_TONE[r] ?? '';
  readonly thaiDateTime = thaiDateTime;

  constructor() {
    this.api.regions().subscribe((r) => this.regions.set(r));
    this.load();
  }

  private blank() {
    return { fullName: '', email: '', role: 'REP', regionId: null as number | null, phone: '', password: '', isActive: true };
  }

  load() {
    this.api.users().subscribe((rows) => this.users.set(rows));
  }

  openCreate() {
    this.form = this.blank();
    this.editingId.set(null);
    this.formOpen.set(true);
  }

  openEdit(u: User) {
    this.form = {
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      regionId: u.regionId,
      phone: u.phone ?? '',
      password: '',
      isActive: u.isActive ?? true,
    };
    this.editingId.set(u.id);
    this.formOpen.set(true);
  }

  save() {
    const id = this.editingId();
    const body: Record<string, unknown> = {
      fullName: this.form.fullName,
      role: this.form.role,
      regionId: this.form.regionId,
      phone: this.form.phone || null,
      isActive: this.form.isActive,
    };
    if (!id) body['email'] = this.form.email;
    if (this.form.password) body['password'] = this.form.password;

    const req = id ? this.api.updateUser(id, body) : this.api.createUser(body);
    if (this.busy()) return;
    this.busy.set(true);
    req.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.toast.success('บันทึกผู้ใช้แล้ว');
        this.formOpen.set(false);
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
