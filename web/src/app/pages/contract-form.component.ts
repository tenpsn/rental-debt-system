import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { errorMessage } from '../core/auth.interceptor';
import { Hospital } from '../core/models';
import { baht, money, thaiDate } from '../core/format';

type EquipmentRow = { name: string; model: string; serialNo: string; qty: number };

@Component({
  selector: 'app-contract-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <a routerLink="/contracts" class="small">← กลับไปรายการสัญญา</a>
        <h1>สร้างสัญญาใหม่</h1>
        <p>ระบบจะสร้างงวดการเรียกเก็บให้อัตโนมัติตามรอบการจ่ายที่กำหนด</p>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:2fr 1fr;align-items:start">
      <div class="card">
        <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
          <div class="grid grid-2">
            <div class="field">
              <label>โรงพยาบาล *</label>
              <select [(ngModel)]="form.hospitalId" (ngModelChange)="onHospitalChange()">
                <option value="">— เลือกโรงพยาบาล —</option>
                @for (h of hospitals(); track h.id) {
                  <option [value]="h.id">{{ h.name }} ({{ h.province || h.code }})</option>
                }
              </select>
            </div>
            <div class="field">
              <label>เลขที่สัญญา / ใบสั่งจ้าง *</label>
              <input [(ngModel)]="form.contractNo" placeholder="CT-2569-018" />
            </div>
          </div>

          <div class="grid grid-3">
            <div class="field">
              <label>ประเภทเอกสาร</label>
              <select [(ngModel)]="form.contractType">
                <option value="LEASE">สัญญาเช่า</option>
                <option value="PURCHASE_ORDER">ใบสั่งจ้าง</option>
                <option value="SHORT_TERM">สัญญาระยะสั้น</option>
              </select>
            </div>
            <div class="field">
              <label>วันเริ่มสัญญา *</label>
              <input type="date" [(ngModel)]="form.startDate" (ngModelChange)="refreshPreview()" />
            </div>
            <div class="field">
              <label>วันสิ้นสุดสัญญา *</label>
              <input type="date" [(ngModel)]="form.endDate" (ngModelChange)="refreshPreview()" />
            </div>
          </div>

          <div class="grid grid-3">
            <div class="field">
              <label>รอบการจ่าย</label>
              <select [(ngModel)]="form.billingCycle" (ngModelChange)="refreshPreview()">
                <option value="MONTHLY">รายเดือน</option>
                <option value="EVERY_10_DAYS">ทุก 10 วัน</option>
                <option value="EVERY_15_DAYS">ทุก 15 วัน</option>
              </select>
            </div>
            <div class="field">
              <label>รูปแบบการคิดเงิน</label>
              <select [(ngModel)]="form.pricingMode">
                <option value="FIXED">เหมารายงวด (Fixed rate)</option>
                <option value="PAY_PER_USE">จ่ายตามใช้ (Pay per use)</option>
              </select>
            </div>
            <div class="field">
              <label>เครดิตเทอม (วัน)</label>
              <input type="number" min="0" [(ngModel)]="form.paymentTermDays" (ngModelChange)="refreshPreview()" />
            </div>
          </div>

          <div class="grid grid-3">
            @if (form.pricingMode === 'FIXED') {
              <div class="field">
                <label>ค่าเช่าต่องวด (ก่อน VAT) *</label>
                <input type="number" min="0" step="0.01" [(ngModel)]="form.periodAmount" (ngModelChange)="refreshPreview()" />
              </div>
            } @else {
              <div class="field">
                <label>ราคาต่อหน่วย (ก่อน VAT) *</label>
                <input type="number" min="0" step="0.01" [(ngModel)]="form.unitPrice" />
              </div>
              <div class="field">
                <label>ชื่อหน่วยนับ</label>
                <input [(ngModel)]="form.unitName" placeholder="ภาพ / ครั้ง / ชิ้น" />
              </div>
            }
            <div class="field">
              <label>VAT (%)</label>
              <input type="number" min="0" max="100" [(ngModel)]="form.vatRate" />
            </div>
            <div class="field">
              <label>สถานะ</label>
              <select [(ngModel)]="form.status">
                <option value="ACTIVE">ใช้งาน</option>
                <option value="DRAFT">ฉบับร่าง</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label>ชื่อสัญญา / หัวข้อ (ถ้ามี)</label>
            <input [(ngModel)]="form.title" placeholder="เช่าเครื่องเอกซเรย์ดิจิทัล 1 เครื่อง" />
          </div>

          <div>
            <div class="row between" style="margin-bottom:8px">
              <label style="font-size:13px;font-weight:600;color:var(--ink-2)">เครื่องที่ให้เช่า</label>
              <button class="btn sm" (click)="addEquipment()">+ เพิ่มรายการ</button>
            </div>
            @for (e of equipment(); track $index) {
              <div class="grid" style="grid-template-columns:2fr 1.4fr 1.2fr 80px 40px;gap:8px;margin-bottom:8px">
                <input [(ngModel)]="e.name" placeholder="ชื่อเครื่อง" />
                <input [(ngModel)]="e.model" placeholder="รุ่น" />
                <input [(ngModel)]="e.serialNo" placeholder="Serial No." />
                <input type="number" min="1" [(ngModel)]="e.qty" />
                <button class="btn sm" (click)="removeEquipment($index)" title="ลบ">✕</button>
              </div>
            } @empty {
              <div class="small muted">ยังไม่มีรายการเครื่อง (สามารถบันทึกภายหลังได้)</div>
            }
          </div>

          <div class="field">
            <label>หมายเหตุ</label>
            <textarea rows="2" [(ngModel)]="form.note"></textarea>
          </div>
        </div>
        <div class="modal-foot">
          <a class="btn" routerLink="/contracts">ยกเลิก</a>
          <button class="btn primary" (click)="save()" [disabled]="saving()">บันทึกสัญญา</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>ตัวอย่างงวดที่จะสร้าง</h2></div>
        <div class="card-body">
          @if (preview(); as pv) {
            <div class="kpi violet" style="margin-bottom:12px">
              <div class="bar"></div>
              <div class="label">จำนวนงวดทั้งหมด</div>
              <div class="value">{{ pv.count }}<small> งวด</small></div>
              <div class="meta">
                @if (form.pricingMode === 'FIXED') {
                  มูลค่ารวม {{ baht((form.periodAmount || 0) * pv.count) }} ก่อน VAT
                } @else {
                  คิดตามปริมาณการใช้จริงแต่ละงวด
                }
              </div>
            </div>
            <div class="scroll-y small">
              @for (p of pv.periods; track p.period_no) {
                <div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)">
                  <span>งวด {{ p.period_no }} · {{ thaiDate(p.period_start) }}</span>
                  <span class="muted">{{ thaiDate(p.period_end) }}</span>
                </div>
              }
            </div>
          } @else {
            <div class="small muted">เลือกช่วงวันที่เพื่อดูตัวอย่างงวด</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ContractFormComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  readonly hospitals = signal<Hospital[]>([]);
  readonly equipment = signal<EquipmentRow[]>([]);
  readonly preview = signal<{ count: number; periods: { period_no: number; period_start: string; period_end: string }[] } | null>(null);
  readonly saving = signal(false);

  form = {
    hospitalId: '',
    contractNo: '',
    contractType: 'LEASE',
    title: '',
    startDate: '',
    endDate: '',
    billingCycle: 'MONTHLY',
    pricingMode: 'FIXED',
    periodAmount: 0 as number | null,
    unitPrice: 0 as number | null,
    unitName: '',
    paymentTermDays: 30,
    vatRate: 7,
    status: 'ACTIVE',
    note: '',
  };

  readonly baht = baht;
  readonly thaiDate = thaiDate;

  constructor() {
    this.api.hospitals().subscribe((rows) => this.hospitals.set(rows.filter((h) => h.isActive)));
  }

  addEquipment() {
    this.equipment.update((rows) => [...rows, { name: '', model: '', serialNo: '', qty: 1 }]);
  }
  removeEquipment(i: number) {
    this.equipment.update((rows) => rows.filter((_, idx) => idx !== i));
  }

  onHospitalChange() {
    const h = this.hospitals().find((x) => x.id === this.form.hospitalId);
    if (h && !this.form.contractNo) {
      const y = new Date().getFullYear() + 543;
      this.form.contractNo = `CT-${y}-`;
    }
  }

  refreshPreview() {
    if (!this.form.startDate || !this.form.endDate) {
      this.preview.set(null);
      return;
    }
    this.api
      .previewPeriods({
        start: this.form.startDate,
        end: this.form.endDate,
        cycle: this.form.billingCycle,
        term: this.form.paymentTermDays,
        mode: this.form.pricingMode,
        amount: this.form.periodAmount ?? null,
      })
      .subscribe({ next: (pv) => this.preview.set(pv), error: () => this.preview.set(null) });
  }

  save() {
    if (!this.form.hospitalId || !this.form.contractNo || !this.form.startDate || !this.form.endDate) {
      this.toast.error('กรอกข้อมูลที่จำเป็นให้ครบก่อนบันทึก');
      return;
    }
    const body: Record<string, unknown> = {
      ...this.form,
      periodAmount: this.form.pricingMode === 'FIXED' ? this.form.periodAmount : null,
      unitPrice: this.form.pricingMode === 'PAY_PER_USE' ? this.form.unitPrice : null,
      unitName: this.form.pricingMode === 'PAY_PER_USE' ? this.form.unitName || 'หน่วย' : null,
      equipment: this.equipment().filter((e) => e.name.trim()).map((e) => ({ ...e, name: e.name.trim() })),
    };
    this.saving.set(true);
    this.api.createContract(body).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.toast.success(`สร้างสัญญาแล้ว · ${res.periodCount} งวด`);
        this.router.navigate(['/contracts', res.id]);
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }
}
