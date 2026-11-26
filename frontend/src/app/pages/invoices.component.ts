import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/auth.interceptor';
import { Hospital, Invoice, User } from '../core/models';
import { PAYMENT_STATE_LABEL, baht, thaiDate, thaiDateShort } from '../core/format';
import { DateInputComponent } from '../core/date-input.component';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DateInputComponent],
  template: `
    <div class="page-head">
      <div>
        <h1>ใบแจ้งหนี้</h1>
        <p>สถานะการจัดส่งและรับชำระของใบแจ้งหนี้ทุกใบ</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-body">
        <div class="filters">
          <div class="field" style="flex:1;min-width:200px">
            <label>ค้นหา</label>
            <input [(ngModel)]="search" (ngModelChange)="debouncedLoad()" placeholder="เลขที่ใบแจ้งหนี้ / โรงพยาบาล" />
          </div>
          <div class="field">
            <label>โรงพยาบาล</label>
            <select [(ngModel)]="hospitalId" (ngModelChange)="load()">
              <option [ngValue]="null">ทั้งหมด</option>
              @for (h of hospitals(); track h.id) { <option [ngValue]="h.id">{{ h.name }}</option> }
            </select>
          </div>
          @if (!auth.isRep()) {
          <div class="field">
            <label>ผู้แทน</label>
            <select [(ngModel)]="repId" (ngModelChange)="load()">
              <option [ngValue]="null">ทั้งหมด</option>
              @for (u of reps(); track u.id) { <option [ngValue]="u.id">{{ u.fullName }}</option> }
            </select>
          </div>
          }
          <div class="field">
            <label>สถานะการชำระ</label>
            <select [(ngModel)]="state" (ngModelChange)="load()">
              <option value="">ทั้งหมด</option>
              <option value="NOT_SENT">ยังไม่ส่ง</option>
              <option value="SENT">ส่งแล้ว รอเช็ค</option>
              <option value="PARTIAL">รับเช็คบางส่วน</option>
              <option value="PAID">รับเช็คครบ</option>
            </select>
          </div>
          <div class="field">
            <label>ช่วงวันที่ออก</label>
            <app-date-input [(ngModel)]="from" (ngModelChange)="load()" />
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>เลขที่ / โรงพยาบาล</th>
              <th>งวด</th>
              <th>วันที่ออก</th>
              <th>ครบกำหนด</th>
              <th class="num">ยอดรวม</th>
              <th class="num">คงค้าง</th>
              <th>การส่ง</th>
              <th>สถานะ</th>
              <th class="num">อายุหนี้</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="9" class="empty">กำลังโหลด…</td></tr>
            }
            @for (i of invoices(); track i.id) {
              <tr class="clickable" [routerLink]="['/invoices', i.id]">
                <td style="min-width:200px">
                  <b class="mono">{{ i.invoiceNo }}</b>
                  <div class="small muted">{{ i.hospitalName }}</div>
                </td>
                <td class="small">
                  {{ i.periodNo ? 'งวด ' + i.periodNo : '—' }}
                  <div class="muted">{{ thaiDate(i.periodStart) }}</div>
                </td>
                <td class="small">{{ thaiDateShort(i.issueDate) }}</td>
                <td class="small">{{ thaiDateShort(i.dueDate) }}</td>
                <td class="num">{{ baht(i.totalAmount) }}</td>
                <td class="num" [style.color]="i.outstandingAmount > 0 ? 'var(--amber)' : ''">{{ baht(i.outstandingAmount) }}</td>
                <td>
                  @if (i.deliveryCount > 0) {
                    <span class="chip green">ส่งแล้ว {{ i.deliveryCount }} ครั้ง</span>
                    <div class="small muted">{{ thaiDateShort(i.lastDeliveredOn) }}</div>
                  } @else {
                    <span class="chip amber">ยังไม่ส่ง</span>
                  }
                </td>
                <td>
                  <span class="chip" [class.green]="i.paymentState === 'PAID'" [class.amber]="i.paymentState === 'NOT_SENT'"
                        [class.blue]="i.paymentState === 'SENT'" [class.violet]="i.paymentState === 'PARTIAL'">
                    {{ stateLabel(i.paymentState) }}
                  </span>
                  @if (i.attachmentCount) { <div class="small muted">📎 {{ i.attachmentCount }}</div> }
                </td>
                <td class="num small" [style.color]="i.daysOverdue > 0 ? 'var(--red)' : 'var(--muted)'">
                  {{ i.daysOverdue > 0 ? i.daysOverdue + ' วัน' : '—' }}
                </td>
              </tr>
            } @empty {
              @if (loadError()) { <tr><td colspan="9" class="empty">โหลดข้อมูลไม่สำเร็จ: {{ loadError() }}</td></tr> }
              @else if (!loading()) { <tr><td colspan="9" class="empty">ไม่พบใบแจ้งหนี้</td></tr> }
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class InvoicesComponent {
  // ข้อความเมื่อโหลดรายการไม่สำเร็จ แยกจากกรณีไม่มีข้อมูลจริง
  readonly loadError = signal('');
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly invoices = signal<Invoice[]>([]);
  readonly hospitals = signal<Hospital[]>([]);
  readonly reps = signal<User[]>([]);
  readonly loading = signal(true);

  search = '';
  hospitalId: string | null = null;
  repId: string | null = null;
  state = '';
  from = '';

  readonly baht = baht;
  readonly thaiDate = thaiDate;
  readonly thaiDateShort = thaiDateShort;
  readonly stateLabel = (s: string) => PAYMENT_STATE_LABEL[s]?.text ?? s;

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.api.hospitals().subscribe((r) => this.hospitals.set(r));
    this.api.users().subscribe((u) => this.reps.set(u.filter((x) => x.role === 'REP')));
    this.load();
  }

  debouncedLoad() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 350);
  }

  load() {
    this.loading.set(true);
    this.loadError.set('');
    this.api
      .invoices({
        search: this.search,
        hospital_id: this.hospitalId,
        rep_id: this.repId,
        state: this.state,
        date_from: this.from,
      })
      .subscribe({
        next: (rows) => {
          this.invoices.set(rows);
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          this.loadError.set(errorMessage(e));
        },
      });
  }
}
