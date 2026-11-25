import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { errorMessage } from '../core/auth.interceptor';
import { Hospital, Region, User } from '../core/models';

@Component({
  selector: 'app-hospitals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h1>โรงพยาบาล</h1>
        <p>ข้อมูลลูกค้า ผู้แทนที่ดูแล และจำนวนสัญญาที่ใช้งาน</p>
      </div>
      @if (auth.canEdit()) {
        <button class="btn primary" (click)="openCreate()">+ เพิ่มโรงพยาบาล</button>
      }
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-body">
        <div class="filters">
          <div class="field" style="flex:1;min-width:200px">
            <label>ค้นหา</label>
            <input [(ngModel)]="search" (ngModelChange)="debouncedLoad()" placeholder="ชื่อ หรือรหัสโรงพยาบาล" />
          </div>
          <div class="field">
            <label>ภาค</label>
            <select [(ngModel)]="regionId" (ngModelChange)="load()">
              <option [ngValue]="null">ทุกภาค</option>
              @for (r of regions(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
            </select>
          </div>
          <div class="field">
            <label>ผู้แทน</label>
            <select [(ngModel)]="repId" (ngModelChange)="load()" [disabled]="auth.user()?.role === 'REP'">
              <option [ngValue]="null">ทุกคน</option>
              @for (u of reps(); track u.id) { <option [ngValue]="u.id">{{ u.fullName }}</option> }
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>รหัส</th><th>โรงพยาบาล</th><th>จังหวัด</th><th>ภาค / ผู้แทน</th><th>ผู้ประสานงาน</th><th class="num">สัญญาใช้งาน</th><th></th></tr>
          </thead>
          <tbody>
            @for (h of hospitals(); track h.id) {
              <tr>
                <td class="mono small">{{ h.code }}</td>
                <td><b>{{ h.name }}</b><div class="small muted">{{ h.hospitalType || '—' }}</div></td>
                <td class="small">{{ h.province || '—' }}</td>
                <td class="small">{{ h.regionName || '—' }}<div class="muted">{{ h.repName || 'ยังไม่กำหนดผู้แทน' }}</div></td>
                <td class="small">
                  {{ h.contactName || '—' }}
                  <div class="muted">{{ h.contactPhone || '' }}</div>
                </td>
                <td class="num">{{ h.activeContracts }}</td>
                <td class="num">
                  @if (auth.canEdit()) {
                    <button class="btn sm" (click)="openEdit(h)">แก้ไข</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">ไม่พบข้อมูล</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head"><h2>{{ editingId() ? 'แก้ไขโรงพยาบาล' : 'เพิ่มโรงพยาบาล' }}</h2></div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="grid grid-2">
              <div class="field"><label>รหัส *</label><input [(ngModel)]="form.code" placeholder="H-001" /></div>
              <div class="field"><label>ชื่อโรงพยาบาล *</label><input [(ngModel)]="form.name" /></div>
            </div>
            <div class="grid grid-3">
              <div class="field"><label>ประเภท</label><input [(ngModel)]="form.hospitalType" placeholder="รพ.ศูนย์ / รพ.ทั่วไป" /></div>
              <div class="field"><label>จังหวัด</label><input [(ngModel)]="form.province" /></div>
              <div class="field">
                <label>ภาค</label>
                <select [(ngModel)]="form.regionId">
                  <option [ngValue]="null">— ไม่ระบุ —</option>
                  @for (r of regions(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
                </select>
              </div>
            </div>
            <div class="field">
              <label>ผู้แทนผู้รับผิดชอบ</label>
              <select [(ngModel)]="form.repId">
                <option [ngValue]="null">— ไม่ระบุ —</option>
                @for (u of reps(); track u.id) { <option [ngValue]="u.id">{{ u.fullName }}</option> }
              </select>
            </div>
            <div class="grid grid-3">
              <div class="field"><label>ผู้ประสานงาน</label><input [(ngModel)]="form.contactName" /></div>
              <div class="field"><label>โทรศัพท์</label><input [(ngModel)]="form.contactPhone" /></div>
              <div class="field"><label>อีเมล</label><input [(ngModel)]="form.contactEmail" /></div>
            </div>
            <div class="field"><label>ที่อยู่</label><textarea rows="2" [(ngModel)]="form.address"></textarea></div>
          </div>
          <div class="modal-foot">
            <button class="btn" (click)="formOpen.set(false)">ยกเลิก</button>
            <button class="btn primary" (click)="save()">บันทึก</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class HospitalsComponent {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly hospitals = signal<Hospital[]>([]);
  readonly regions = signal<Region[]>([]);
  readonly reps = signal<User[]>([]);
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);

  search = '';
  regionId: number | null = null;
  repId: string | null = null;

  form = this.blank();

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.api.regions().subscribe((r) => this.regions.set(r));
    this.api.users().subscribe((u) => this.reps.set(u.filter((x) => x.role === 'REP')));
    this.load();
  }

  private blank() {
    return {
      code: '',
      name: '',
      hospitalType: '',
      province: '',
      regionId: null as number | null,
      repId: null as string | null,
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      address: '',
    };
  }

  debouncedLoad() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 350);
  }

  load() {
    this.api.hospitals({ search: this.search, region_id: this.regionId, rep_id: this.repId }).subscribe((rows) => this.hospitals.set(rows));
  }

  openCreate() {
    this.form = this.blank();
    this.editingId.set(null);
    this.formOpen.set(true);
  }

  openEdit(h: Hospital) {
    this.form = {
      code: h.code,
      name: h.name,
      hospitalType: h.hospitalType ?? '',
      province: h.province ?? '',
      regionId: h.regionId,
      repId: h.repId,
      contactName: h.contactName ?? '',
      contactPhone: h.contactPhone ?? '',
      contactEmail: h.contactEmail ?? '',
      address: h.address ?? '',
    };
    this.editingId.set(h.id);
    this.formOpen.set(true);
  }

  save() {
    const id = this.editingId();
    const body = { ...this.form };
    const req = id ? this.api.updateHospital(id, body) : this.api.createHospital(body);
    req.subscribe({
      next: () => {
        this.toast.success('บันทึกข้อมูลแล้ว');
        this.formOpen.set(false);
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
