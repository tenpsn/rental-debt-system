import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { errorMessage } from '../core/auth.interceptor';
import { ContractDetail, Period } from '../core/models';
import { DateInputComponent } from '../core/date-input.component';
import {
  BILLING_CYCLE_LABEL, CONTRACT_STATUS_LABEL, CONTRACT_TYPE_LABEL, PAYMENT_STATE_LABEL,
  baht, compactBaht, percent, thaiDate, thaiDateShort,
  todayIso,
} from '../core/format';
import { ModalDirective } from '../core/modal.directive';

@Component({
  selector: 'app-contract-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DateInputComponent, ModalDirective],
  template: `
    @if (contract(); as c) {
      <div class="page-head">
        <div>
          <div class="row" style="gap:8px;margin-bottom:6px">
            <a routerLink="/contracts" class="small">← กลับไปรายการสัญญา</a>
          </div>
          <h1>{{ c.contractNo }}</h1>
          <p>
            <a [routerLink]="['/hospitals']">{{ c.hospitalName }}</a> · {{ c.regionName }} · ผู้แทน {{ c.repName || 'ยังไม่กำหนด' }}
          </p>
        </div>
        <div class="row wrap">
          @if (auth.canEdit()) {
            <button class="btn" (click)="openRenew()">ต่อสัญญาใหม่</button>
          }
          @if (auth.canInvoice() && bulkCandidates().length) {
            <button class="btn primary" (click)="bulkIssue()" [disabled]="saving()">ออกใบแจ้งหนี้ที่ค้าง {{ bulkCandidates().length }} งวด</button>
          }
          @if (auth.isAdmin() && c.status !== 'CANCELLED') {
            <button class="btn danger" (click)="cancelContract()" [disabled]="saving()">ยกเลิกสัญญา</button>
          }
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="kpi violet">
          <div class="bar"></div>
          <div class="label">งวดที่ยังไม่แจ้งหนี้</div>
          <div class="value">{{ c.totalPeriods - c.invoicedPeriods }}<small> / {{ c.totalPeriods }} งวด</small></div>
          <div class="meta">{{ c.pricingMode === 'FIXED' ? 'เหมารายงวด' : 'จ่ายตามใช้ (ประมาณการจากค่าเฉลี่ย)' }}</div>
        </div>
        <div class="kpi">
          <div class="bar"></div>
          <div class="label">มูลค่าคงเหลือในสัญญา</div>
          <div class="value">{{ compactBaht(c.remainingValue) }}</div>
          <div class="meta">ยังไม่ออกใบแจ้งหนี้ · ไม่รวม VAT</div>
        </div>
        <div class="kpi green">
          <div class="bar"></div>
          <div class="label">รับเช็คแล้ว</div>
          <div class="value">{{ compactBaht(c.collectedAmount) }}</div>
          <div class="meta">จากใบแจ้งหนี้ {{ baht(c.invoicedAmount) }}</div>
        </div>
        <div class="kpi amber">
          <div class="bar"></div>
          <div class="label">ค้างรับชำระ</div>
          <div class="value">{{ compactBaht(c.outstandingAmount) }}</div>
          <div class="meta">งวดถัดไปครบกำหนด {{ thaiDate(c.nextDueDate) }}</div>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom:14px;align-items:start">
        <div class="card">
          <div class="card-head"><h2>ข้อมูลสัญญา</h2><span [class]="'chip ' + statusLabel(c.status).tone">{{ statusLabel(c.status).text }}</span></div>
          <div class="card-body">
            <dl class="kv">
              <dt>ประเภท</dt><dd>{{ typeLabel(c.contractType) }}</dd>
              <dt>ช่วงสัญญา</dt><dd>{{ thaiDate(c.startDate) }} – {{ thaiDate(c.endDate) }}</dd>
              <dt>รอบการจ่าย</dt><dd>{{ cycleLabel(c.billingCycle) }}</dd>
              <dt>{{ c.pricingMode === 'FIXED' ? 'ค่าเช่า/งวด' : 'ราคาต่อหน่วย' }}</dt>
              <dd>
                @if (c.pricingMode === 'FIXED') { {{ baht(c.periodAmount, 2) }} }
                @else { {{ baht(c.unitPrice, 2) }} / {{ c.unitName || 'หน่วย' }} }
              </dd>
              <dt>เครดิตเทอม</dt><dd>{{ c.paymentTermDays }} วัน</dd>
              <dt>VAT</dt><dd>{{ c.vatRate }}%</dd>
              @if (c.note) { <dt>หมายเหตุ</dt><dd>{{ c.note }}</dd> }
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>เครื่องที่ให้เช่า</h2></div>
          <div class="card-body" style="padding:0">
            <table>
              <thead><tr><th>รายการ</th><th>รุ่น / Serial</th><th class="num">จำนวน</th></tr></thead>
              <tbody>
                @for (e of c.equipment; track e.id) {
                  <tr>
                    <td>{{ e.name }}</td>
                    <td class="small">{{ e.model || '—' }}<div class="muted mono">{{ e.serialNo }}</div></td>
                    <td class="num">{{ e.qty }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="empty">ยังไม่บันทึกเครื่อง</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>ความคืบหน้าการเรียกเก็บ</h2></div>
          <div class="card-body">
            <div class="row between small" style="margin-bottom:5px">
              <span>แจ้งหนี้แล้ว</span><b>{{ c.invoicedPeriods }} / {{ c.totalPeriods }} งวด</b>
            </div>
            <div class="progress"><span [style.width.%]="c.totalPeriods ? (c.invoicedPeriods / c.totalPeriods) * 100 : 0"></span></div>
            <div class="divider"></div>
            <div class="row between small" style="margin-bottom:5px">
              <span>จัดเก็บได้ (เทียบยอดที่แจ้ง)</span><b>{{ percent(c.invoicedAmount ? (c.collectedAmount / c.invoicedAmount) * 100 : 0) }}</b>
            </div>
            <div class="progress green"><span [style.width.%]="c.invoicedAmount ? (c.collectedAmount / c.invoicedAmount) * 100 : 0"></span></div>
            <div class="divider"></div>
            <div class="small muted">
              งวดที่เริ่มแล้วแต่ยังไม่แจ้งหนี้ {{ dueUninvoiced().length }} งวด ·
              มูลค่ารวม {{ baht(dueUninvoicedValue()) }}
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>งวดการเรียกเก็บ</h2>
          <span class="small muted">เรียงตามลำดับงวด</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="num">งวด</th><th>ช่วงเวลา</th><th>ครบกำหนด</th>
                <th class="num">มูลค่า</th><th>ใบแจ้งหนี้</th><th>การส่ง</th><th>การเงิน</th><th></th>
              </tr>
            </thead>
            <tbody>
              @for (p of c.periods; track p.id) {
                <tr>
                  <td class="num"><b>{{ p.periodNo }}</b></td>
                  <td>{{ thaiDate(p.periodStart) }} – {{ thaiDate(p.periodEnd) }}</td>
                  <td>{{ thaiDateShort(p.dueDate) }}</td>
                  <td class="num">
                    @if (p.expectedAmount !== null) { {{ baht(p.expectedAmount) }} }
                    @else { <span class="muted small">ตามการใช้จริง</span> }
                  </td>
                  <td>
                    @if (p.invoiceNo) {
                      <a class="mono" [routerLink]="['/invoices', p.invoiceId]">{{ p.invoiceNo }}</a>
                      <div class="small muted">{{ baht(p.totalAmount) }}</div>
                    } @else if (p.isOverdueUninvoiced) {
                      <span class="chip amber">ยังไม่ออก · เลยกำหนด</span>
                    } @else {
                      <span class="chip">ยังไม่แจ้งหนี้</span>
                    }
                  </td>
                  <td>
                    @if (p.lastDeliveredOn) { <span class="chip green">ส่ง {{ thaiDateShort(p.lastDeliveredOn) }}</span> }
                    @else if (p.invoiceNo) { <span class="chip amber">ยังไม่ส่ง</span> }
                    @else { <span class="muted small">—</span> }
                  </td>
                  <td>
                    @if (p.paymentState) {
                      <span class="chip" [class.green]="p.paymentState === 'PAID'" [class.amber]="p.paymentState === 'NOT_SENT'"
                            [class.blue]="p.paymentState === 'SENT'" [class.violet]="p.paymentState === 'PARTIAL'">
                        {{ stateLabel(p.paymentState) }}
                      </span>
                    } @else { <span class="muted small">—</span> }
                    @if (p.daysOverdue > 0 && p.outstandingAmount) {
                      <div class="small" style="color:var(--red)">เกิน {{ p.daysOverdue }} วัน</div>
                    }
                  </td>
                  <td class="num">
                    @if (!p.invoiceId && auth.canInvoice() && p.periodStart <= today) {
                      <button class="btn sm primary" (click)="openIssue(p)">ออกใบแจ้งหนี้</button>
                    }
                    @if (p.invoiceId) {
                      <a class="btn sm" [routerLink]="['/invoices', p.invoiceId]">ดูใบแจ้งหนี้</a>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @else {
      @if (loadError()) {
        <div class="card"><div class="empty">
          <div style="margin-bottom:10px">โหลดข้อมูลไม่สำเร็จ: {{ loadError() }}</div>
          <a routerLink="/contracts">← กลับไปรายการสัญญา</a>
        </div></div>
      } @else {
        <div class="card"><div class="empty">กำลังโหลดสัญญา…</div></div>
      }
    }

    <!-- issue invoice dialog -->
    @if (issuePeriod(); as p) {
      <div class="modal-backdrop" appModal (dismiss)="issuePeriod.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head"><h2>ออกใบแจ้งหนี้ งวดที่ {{ p.periodNo }}</h2></div>
          <div class="modal-body">
            <div class="alert info" style="margin-bottom:14px">
              ช่วงงวด {{ thaiDate(p.periodStart) }} – {{ thaiDate(p.periodEnd) }}
              @if (contract()?.pricingMode === 'FIXED') {
                · ค่าเช่า {{ baht(contract()?.periodAmount) }} + VAT {{ contract()?.vatRate }}%
              } @else {
                · ราคาต่อหน่วย {{ baht(contract()?.unitPrice, 2) }} / {{ contract()?.unitName }}
              }
            </div>
            <div class="grid grid-2">
              <div class="field">
                <label>วันที่ออกใบแจ้งหนี้</label>
                <app-date-input [(ngModel)]="issueForm.issueDate" />
              </div>
              @if (contract()?.pricingMode === 'PAY_PER_USE') {
                <div class="field">
                  <label>จำนวน {{ contract()?.unitName || 'หน่วย' }}</label>
                  <input type="number" min="0" [ngModel]="usageQty()" (ngModelChange)="usageQty.set(Math.max(0, +$event || 0))" />
                </div>
              }
            </div>
            <div class="divider"></div>
            <div class="row between"><span class="muted">ยอดก่อน VAT</span><b>{{ baht(issueAmount()) }}</b></div>
            <div class="row between" style="margin-top:6px">
              <span class="muted">VAT {{ contract()?.vatRate }}%</span><b>{{ baht(issueVat()) }}</b>
            </div>
            <div class="row between" style="margin-top:6px">
              <span><b>รวมทั้งสิ้น</b></span><b style="font-size:18px">{{ baht(issueAmount() + issueVat(), 2) }}</b>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" (click)="issuePeriod.set(null)">ยกเลิก</button>
            <button class="btn primary" (click)="issue()" [disabled]="saving()">ออกใบแจ้งหนี้</button>
          </div>
        </div>
      </div>
    }

    <!-- renew dialog -->
    @if (renewOpen()) {
      <div class="modal-backdrop" appModal (dismiss)="renewOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head"><h2>ต่อสัญญาใหม่</h2></div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label>เลขที่สัญญาใหม่</label><input [(ngModel)]="renewForm.contractNo" /></div>
            <div class="grid grid-2">
              <div class="field"><label>วันเริ่ม</label><app-date-input [(ngModel)]="renewForm.startDate" /></div>
              <div class="field"><label>วันสิ้นสุด</label><app-date-input [(ngModel)]="renewForm.endDate" /></div>
            </div>
            <div class="small muted">ระบบจะคัดลอกเงื่อนไข ราคา และรายการเครื่องจากสัญญาเดิม</div>
          </div>
          <div class="modal-foot">
            <button class="btn" (click)="renewOpen.set(false)">ยกเลิก</button>
            <button class="btn primary" (click)="renew()" [disabled]="saving()">สร้างสัญญาต่อเนื่อง</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ContractDetailComponent implements OnInit {
  // ข้อความเมื่อโหลดข้อมูลหลักของหน้าไม่สำเร็จ
  readonly loadError = signal('');
  readonly id = input.required<string>();

  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  readonly contract = signal<ContractDetail | null>(null);
  readonly issuePeriod = signal<Period | null>(null);
  readonly renewOpen = signal(false);
  readonly saving = signal(false);

  readonly today = todayIso();
  issueForm = { issueDate: todayIso() };
  // จำนวนที่ใช้ของสัญญาแบบจ่ายตามใช้ เป็น signal ยอดเงินถึงจะคำนวณใหม่ทุกครั้งที่พิมพ์
  readonly usageQty = signal(0);
  readonly Math = Math;
  renewForm = { contractNo: '', startDate: '', endDate: '' };

  readonly baht = baht;
  readonly compactBaht = compactBaht;
  readonly percent = percent;
  readonly thaiDate = thaiDate;
  readonly thaiDateShort = thaiDateShort;
  readonly typeLabel = (t: string) => CONTRACT_TYPE_LABEL[t] ?? t;
  readonly cycleLabel = (c: string) => BILLING_CYCLE_LABEL[c] ?? c;
  readonly statusLabel = (s: string) => CONTRACT_STATUS_LABEL[s] ?? { text: s, tone: '' };
  readonly stateLabel = (s: string) => PAYMENT_STATE_LABEL[s]?.text ?? s;

  readonly dueUninvoiced = computed(() =>
    (this.contract()?.periods ?? []).filter((p) => !p.invoiceId && p.periodStart <= this.today),
  );
  readonly dueUninvoicedValue = computed(() =>
    this.dueUninvoiced().reduce((sum, p) => sum + (p.expectedAmount ?? 0), 0),
  );
  readonly bulkCandidates = computed(() =>
    (this.contract()?.periods ?? []).filter(
      (p) => !p.invoiceId && p.periodStart <= this.today && this.contract()?.pricingMode === 'FIXED',
    ),
  );

  readonly issueAmount = computed(() => {
    const c = this.contract();
    const p = this.issuePeriod();
    if (!c || !p) return 0;
    if (c.pricingMode === 'PAY_PER_USE') return Math.round((c.unitPrice ?? 0) * (this.usageQty() || 0) * 100) / 100;
    return p.expectedAmount ?? c.periodAmount ?? 0;
  });
  readonly issueVat = computed(() => Math.round(this.issueAmount() * ((this.contract()?.vatRate ?? 0) / 100) * 100) / 100);

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.contract(this.id()).subscribe({
      next: (c) => {
        this.contract.set(c);
        this.renewForm = {
          contractNo: `${c.contractNo.replace(/\d{4}$/, (y) => String(Number(y) + 1))}`,
          ...renewalRange(c.endDate),
        };
      },
      error: (e) => this.loadError.set(errorMessage(e)),
    });
  }

  openIssue(p: Period) {
    this.issueForm = {
      issueDate: todayIso(),
    };
    this.usageQty.set(0);
    this.issuePeriod.set(p);
  }

  issue() {
    const c = this.contract();
    const p = this.issuePeriod();
    if (!c || !p) return;
    const body: Record<string, unknown> = {
      contractId: c.id,
      periodId: p.id,
      issueDate: this.issueForm.issueDate,
    };
    if (c.pricingMode === 'PAY_PER_USE') {
      if (!(this.usageQty() > 0)) {
        this.toast.error('กรอกจำนวนที่ใช้ให้มากกว่า 0');
        return;
      }
      body['usageQty'] = this.usageQty();
    }

    this.saving.set(true);
    this.api.createInvoice(body).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.issuePeriod.set(null);
        this.toast.success(`ออกใบแจ้งหนี้ ${res.invoiceNo} แล้ว`);
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }

  bulkIssue() {
    const candidates = this.bulkCandidates();
    if (!candidates.length) return;
    if (!confirm(`ออกใบแจ้งหนี้ให้ ${candidates.length} งวดที่ค้าง ณ วันที่ ${this.today} หรือไม่`)) return;
    if (this.saving()) return;
    this.saving.set(true);
    this.api.bulkInvoice({ periodIds: candidates.map((p) => p.id), issueDate: this.today }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (res) => {
        this.toast.success(`ออกใบแจ้งหนี้แล้ว ${res.createdCount} ใบ`);
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  // ยกเลิกสัญญาได้เฉพาะเมื่อไม่มีหนี้ค้าง ถ้ายังค้างระบบจะแจ้งจำนวนใบที่ค้าง
  cancelContract() {
    const contractNo = this.contract()?.contractNo ?? '';
    if (!confirm(`ยืนยันการยกเลิกสัญญา ${contractNo}\nสถานะจะเปลี่ยนเป็นยกเลิก ข้อมูลเดิมยังเก็บไว้ครบ`)) return;
    this.saving.set(true);
    this.api.cancelContract(this.id()).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.toast.success(`ยกเลิกสัญญา ${contractNo} แล้ว`);
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  openRenew() {
    const c = this.contract();
    if (!c) return;
    this.renewForm = {
      contractNo: `${c.contractNo}`.replace(/(\d{4})$/, (y) => String(Number(y) + 1)),
      ...renewalRange(c.endDate),
    };
    this.renewOpen.set(true);
  }

  renew() {
    if (!this.renewForm.startDate || !this.renewForm.endDate || this.renewForm.endDate < this.renewForm.startDate) {
      this.toast.error('วันสิ้นสุดสัญญาต้องไม่อยู่ก่อนวันเริ่มสัญญา');
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    this.api.renewContract(this.id(), this.renewForm).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (res) => {
        this.toast.success('สร้างสัญญาต่อเนื่องแล้ว');
        this.renewOpen.set(false);
        this.router.navigate(['/contracts', res.id]);
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}

// คำนวณวันที่แบบ UTC ทั้งหมด ไม่ให้เขตเวลาของเครื่องทำวันเพี้ยน
function shiftDate(iso: string, years: number, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y + years, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// ช่วงสัญญาต่อเนื่อง เริ่มวันถัดจากวันสิ้นสุดสัญญาเดิม และยาว 1 ปี
// เช่น สัญญาเดิมสิ้นสุด 31 ธ.ค. 2569 สัญญาใหม่ 1 ม.ค. ถึง 31 ธ.ค. 2570
function renewalRange(oldEndDate: string): { startDate: string; endDate: string } {
  const startDate = shiftDate(oldEndDate, 0, 1);
  return { startDate, endDate: shiftDate(startDate, 1, -1) };
}
