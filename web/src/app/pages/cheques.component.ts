import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { errorMessage } from '../core/auth.interceptor';
import { Cheque, Hospital, UnpaidInvoice, User } from '../core/models';
import { CHEQUE_DELIVERY_LABEL, CHEQUE_STATUS_LABEL, baht, compactBaht, thaiDate, thaiDateShort } from '../core/format';

@Component({
  selector: 'app-cheques',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <h1>เช็ค / การรับชำระ</h1>
        <p>บันทึกเช็คที่ผู้แทนรับจากโรงพยาบาล และติดตามว่าเช็คถึงบริษัทเมื่อใด</p>
      </div>
      <button class="btn primary" (click)="openCreate()">+ บันทึกเช็ค</button>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-body">
        <div class="filters">
          <div class="field">
            <label>สถานะ</label>
            <select [(ngModel)]="status" (ngModelChange)="load()">
              <option value="">ทั้งหมด</option>
              <option value="RECEIVED">รับเช็คแล้ว</option>
              <option value="DEPOSITED">นำฝากแล้ว</option>
              <option value="CLEARED">เงินเข้าแล้ว</option>
              <option value="BOUNCED">เช็คเด้ง</option>
            </select>
          </div>
          <div class="field">
            <label>โรงพยาบาล</label>
            <select [(ngModel)]="hospitalId" (ngModelChange)="load()">
              <option [ngValue]="null">ทั้งหมด</option>
              @for (h of hospitals(); track h.id) { <option [ngValue]="h.id">{{ h.name }}</option> }
            </select>
          </div>
          <div class="field">
            <label>ผู้แทน</label>
            <select [(ngModel)]="repId" (ngModelChange)="load()" [disabled]="auth.user()?.role === 'REP'">
              <option [ngValue]="null">ทั้งหมด</option>
              @for (u of reps(); track u.id) { <option [ngValue]="u.id">{{ u.fullName }}</option> }
            </select>
          </div>
          <div class="field">
            <label>รับตั้งแต่</label>
            <input type="date" [(ngModel)]="from" (ngModelChange)="load()" />
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="min-width:130px">เลขที่เช็ค</th><th style="min-width:190px">โรงพยาบาล</th><th>วันที่หน้าเช็ค</th><th>วันที่รับ</th>
              <th class="num">ยอดเช็ค</th><th class="num">ตัดหนี้แล้ว</th><th>การนำส่ง</th><th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) { <tr><td colspan="8" class="empty">กำลังโหลด…</td></tr> }
            @for (c of cheques(); track c.id) {
              <tr class="clickable" [routerLink]="['/cheques', c.id]">
                <td class="mono"><b>{{ c.chequeNo }}</b><div class="small muted">{{ c.bankName }}</div></td>
                <td style="min-width:190px">{{ c.hospitalName }}<div class="small muted">{{ c.repName || '—' }}</div></td>
                <td class="small">{{ thaiDateShort(c.chequeDate) }}</td>
                <td class="small">{{ thaiDateShort(c.receivedDate) }}</td>
                <td class="num">{{ baht(c.amount) }}</td>
                <td class="num">
                  {{ baht(c.allocatedAmount) }}
                  <div class="small muted">{{ c.invoiceCount }} ใบ</div>
                </td>
                <td class="small">
                  {{ deliveryLabel(c.deliveryMethod) }}
                  @if (c.companyReceivedDate) {
                    <div class="small" style="color:var(--green)">ถึงบริษัท {{ thaiDateShort(c.companyReceivedDate) }}</div>
                  } @else {
                    <div class="small" style="color:var(--amber)">ยังไม่ถึงบริษัท</div>
                  }
                </td>
                <td>
                  <span class="chip" [class.green]="c.status === 'CLEARED'" [class.blue]="c.status === 'RECEIVED'"
                        [class.violet]="c.status === 'DEPOSITED'" [class.red]="c.status === 'BOUNCED' || c.status === 'RETURNED'">
                    {{ statusLabel(c.status) }}
                  </span>
                  @if (c.attachmentCount) { <div class="small muted">📎 {{ c.attachmentCount }}</div> }
                </td>
              </tr>
            } @empty {
              @if (!loading()) { <tr><td colspan="8" class="empty">ไม่พบเช็ค</td></tr> }
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (createOpen()) {
      <div class="modal-backdrop" (click)="createOpen.set(false)">
        <div class="modal wide" (click)="$event.stopPropagation()">
          <div class="modal-head"><h2>บันทึกเช็คใหม่</h2></div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="grid grid-2">
              <div class="field">
                <label>โรงพยาบาล *</label>
                <select [(ngModel)]="form.hospitalId" (ngModelChange)="loadUnpaid()">
                  <option value="">— เลือก —</option>
                  @for (h of hospitals(); track h.id) { <option [value]="h.id">{{ h.name }}</option> }
                </select>
              </div>
              <div class="field"><label>ผู้แทนที่รับเช็ค</label>
                <select [(ngModel)]="form.receivedBy">
                  <option [ngValue]="null">— ไม่ระบุ —</option>
                  @for (u of reps(); track u.id) { <option [ngValue]="u.id">{{ u.fullName }}</option> }
                </select>
              </div>
            </div>
            <div class="grid grid-3">
              <div class="field"><label>เลขที่เช็ค *</label><input [(ngModel)]="form.chequeNo" /></div>
              <div class="field"><label>ธนาคาร *</label><input [(ngModel)]="form.bankName" placeholder="กสิกรไทย" /></div>
              <div class="field"><label>สาขา</label><input [(ngModel)]="form.bankBranch" /></div>
            </div>
            <div class="grid grid-3">
              <div class="field"><label>จำนวนเงิน *</label><input type="number" min="0" step="0.01" [(ngModel)]="form.amount" /></div>
              <div class="field"><label>วันที่หน้าเช็ค</label><input type="date" [(ngModel)]="form.chequeDate" /></div>
              <div class="field"><label>วันที่รับเช็ค</label><input type="date" [(ngModel)]="form.receivedDate" /></div>
            </div>
            <div class="grid grid-2">
              <div class="field">
                <label>วิธีนำส่ง</label>
                <select [(ngModel)]="form.deliveryMethod">
                  <option value="REP_PICKUP">ผู้แทนเข้าไปรับที่ รพ.</option>
                  <option value="SENT_TO_COMPANY">รพ. ส่งมาที่บริษัท</option>
                  <option value="REP_TO_COMPANY">ผู้แทนนำส่งบริษัท</option>
                  <option value="HAND_DELIVERED">นำส่งด้วยตนเอง</option>
                </select>
              </div>
              <div class="field"><label>วันที่ถึงบริษัท</label><input type="date" [(ngModel)]="form.companyReceivedDate" /></div>
            </div>

            <div class="divider"></div>
            <div class="row between">
              <b>ตัดชำระใบแจ้งหนี้</b>
              <span class="small" [style.color]="allocatedTotal() > form.amount ? 'var(--red)' : 'var(--ink-3)'">
                ตัดแล้ว {{ baht(allocatedTotal()) }} / {{ baht(form.amount) }}
              </span>
            </div>
            <div class="scroll-y" style="max-height:240px">
              <table>
                <thead><tr><th></th><th>เลขที่ใบแจ้งหนี้</th><th>ครบกำหนด</th><th class="num">คงค้าง</th><th class="num">ตัดชำระ</th></tr></thead>
                <tbody>
                  @for (u of unpaid(); track u.id) {
                    <tr>
                      <td><input type="checkbox" [checked]="alloc[u.id] !== undefined" (change)="toggleAlloc(u)" /></td>
                      <td class="mono small">{{ u.invoiceNo }}</td>
                      <td class="small">{{ thaiDateShort(u.dueDate) }}</td>
                      <td class="num small">{{ baht(u.outstandingAmount) }}</td>
                      <td class="num">
                        @if (alloc[u.id] !== undefined) {
                          <input type="number" style="width:110px;text-align:right" step="0.01"
                                 [ngModel]="alloc[u.id]" (ngModelChange)="setAlloc(u.id, $event)" />
                        } @else { <span class="muted">—</span> }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="5" class="empty small">
                      {{ form.hospitalId ? 'ไม่มีใบแจ้งหนี้ค้างชำระ' : 'เลือกโรงพยาบาลก่อน' }}
                    </td></tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="field"><label>หมายเหตุ</label><input [(ngModel)]="form.note" /></div>
          </div>
          <div class="modal-foot">
            <button class="btn" (click)="createOpen.set(false)">ยกเลิก</button>
            <button class="btn primary" (click)="save()" [disabled]="saving()">บันทึกเช็ค</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ChequesComponent {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly cheques = signal<Cheque[]>([]);
  readonly hospitals = signal<Hospital[]>([]);
  readonly reps = signal<User[]>([]);
  readonly unpaid = signal<UnpaidInvoice[]>([]);
  readonly createOpen = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);

  status = '';
  hospitalId: string | null = null;
  repId: string | null = null;
  from = '';

  form = this.blankForm();
  alloc: Record<string, number> = {};

  readonly baht = baht;
  readonly thaiDateShort = thaiDateShort;
  readonly statusLabel = (s: string) => CHEQUE_STATUS_LABEL[s]?.text ?? s;
  readonly deliveryLabel = (m: string) => CHEQUE_DELIVERY_LABEL[m] ?? m;
  readonly allocatedTotal = computed(() => Object.values(this.alloc).reduce((a, b) => a + (Number(b) || 0), 0));

  constructor() {
    this.api.hospitals().subscribe((r) => this.hospitals.set(r));
    this.api.users().subscribe((u) => this.reps.set(u.filter((x) => x.role === 'REP')));
    this.load();
  }

  private blankForm() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      hospitalId: '',
      chequeNo: '',
      bankName: '',
      bankBranch: '',
      amount: 0,
      chequeDate: today,
      receivedDate: today,
      receivedBy: null as string | null,
      deliveryMethod: 'REP_PICKUP',
      companyReceivedDate: null as string | null,
      note: '',
    };
  }

  load() {
    this.loading.set(true);
    this.api
      .cheques({ status: this.status, hospital_id: this.hospitalId, rep_id: this.repId, date_from: this.from })
      .subscribe({
        next: (rows) => {
          this.cheques.set(rows);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  openCreate() {
    this.form = this.blankForm();
    this.alloc = {};
    this.unpaid.set([]);
    this.createOpen.set(true);
  }

  loadUnpaid() {
    this.alloc = {};
    if (!this.form.hospitalId) {
      this.unpaid.set([]);
      return;
    }
    this.api.unpaidInvoices({ hospital_id: this.form.hospitalId, limit: 50 }).subscribe((rows) => this.unpaid.set(rows));
  }

  toggleAlloc(u: UnpaidInvoice) {
    if (this.alloc[u.id] !== undefined) {
      delete this.alloc[u.id];
    } else {
      const remaining = Math.max(0, (this.form.amount || 0) - this.allocatedTotal());
      this.alloc[u.id] = Math.min(u.outstandingAmount, remaining || u.outstandingAmount);
    }
  }

  setAlloc(id: string, value: number) {
    this.alloc[id] = Number(value) || 0;
  }

  save() {
    if (!this.form.hospitalId || !this.form.chequeNo || !this.form.bankName || !(this.form.amount > 0)) {
      this.toast.error('กรอกโรงพยาบาล เลขที่เช็ค ธนาคาร และจำนวนเงินให้ครบ');
      return;
    }
    const body = {
      ...this.form,
      companyReceivedDate: this.form.companyReceivedDate || null,
      allocations: Object.entries(this.alloc)
        .filter(([, v]) => Number(v) > 0)
        .map(([invoiceId, amount]) => ({ invoiceId, amount: Number(amount) })),
    };
    this.saving.set(true);
    this.api.createCheque(body).subscribe({
      next: () => {
        this.saving.set(false);
        this.createOpen.set(false);
        this.toast.success('บันทึกเช็คแล้ว');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }
}
