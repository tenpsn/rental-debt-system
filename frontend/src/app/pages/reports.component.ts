import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import {
  AgingRow, DeliveryCoverageRow, GroupRow, Region, UninvoicedPeriod, UnpaidInvoice, User,
} from '../core/models';
import { baht, compactBaht, percent, thaiDate, thaiDateShort } from '../core/format';

type Tab = 'rep' | 'hospital' | 'aging' | 'delivery' | 'uninvoiced' | 'unpaid';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <h1>รายงาน</h1>
        <p>สรุปภาพรวม แยกตามผู้แทน/โรงพยาบาล อายุหนี้ และรายการที่ยังไม่ได้ดำเนินการ</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-body">
        <div class="filters">
          <div class="field">
            <label>ณ วันที่</label>
            <input type="date" [(ngModel)]="asOf" (ngModelChange)="loadAll()" />
          </div>
          <div class="field">
            <label>ภาค</label>
            <select [(ngModel)]="regionId" (ngModelChange)="loadAll()" [disabled]="auth.user()?.role === 'REP'">
              <option [ngValue]="null">ทุกภาค</option>
              @for (r of regions(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
            </select>
          </div>
          <div class="field">
            <label>ผู้แทน</label>
            <select [(ngModel)]="repId" (ngModelChange)="loadAll()" [disabled]="auth.user()?.role === 'REP'">
              <option [ngValue]="null">ทุกคน</option>
              @for (u of reps(); track u.id) { <option [ngValue]="u.id">{{ u.fullName }}</option> }
            </select>
          </div>
        </div>
        <div class="tabs" style="margin-top:6px">
          <button class="tab" [class.active]="tab() === 'rep'" (click)="setTab('rep')">ตามผู้แทน</button>
          <button class="tab" [class.active]="tab() === 'hospital'" (click)="setTab('hospital')">ตามโรงพยาบาล</button>
          <button class="tab" [class.active]="tab() === 'aging'" (click)="setTab('aging')">อายุหนี้</button>
          <button class="tab" [class.active]="tab() === 'delivery'" (click)="setTab('delivery')">การส่งใบแจ้งหนี้</button>
          <button class="tab" [class.active]="tab() === 'uninvoiced'" (click)="setTab('uninvoiced')">ยังไม่แจ้งหนี้</button>
          <button class="tab" [class.active]="tab() === 'unpaid'" (click)="setTab('unpaid')">ยังไม่ได้รับเช็ค</button>
        </div>
      </div>
    </div>

    @if (tab() === 'rep' || tab() === 'hospital') {
      <div class="card">
        <div class="card-head">
          <h2>{{ tab() === 'rep' ? 'สรุปตามผู้แทน' : 'สรุปตามโรงพยาบาล' }}</h2>
          <button class="btn sm" (click)="exportCsv()">ดาวน์โหลด CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ tab() === 'rep' ? 'ผู้แทน' : 'โรงพยาบาล' }}</th>
                <th class="num">สัญญา/รพ.</th>
                <th class="num">งวดทั้งหมด</th>
                <th class="num">แจ้งแล้ว</th>
                <th class="num" style="color:var(--amber)">ค้างแจ้ง (งวด)</th>
                <th class="num">มูลค่าคงเหลือ</th>
                <th class="num">แจ้งหนี้รวม</th>
                <th class="num">รับเช็คแล้ว</th>
                <th class="num">ค้างรับ</th>
                <th class="num">อัตราเก็บ</th>
              </tr>
            </thead>
            <tbody>
              @for (g of groups(); track g.id) {
                <tr>
                  <td><b>{{ g.name }}</b><div class="small muted">{{ g.subLabel }}</div></td>
                  <td class="num">{{ tab() === 'rep' ? g.hospitalCount + ' รพ.' : g.invoiceCount + ' ใบ' }}</td>
                  <td class="num">{{ g.totalPeriods }}</td>
                  <td class="num">{{ g.invoicedPeriods }}</td>
                  <td class="num" style="color:var(--amber)">
                    {{ g.dueNotInvoicedPeriods }}
                    <div class="small muted">{{ compactBaht(g.dueNotInvoicedAmount) }}</div>
                  </td>
                  <td class="num">{{ compactBaht(g.remainingValue) }}</td>
                  <td class="num">{{ compactBaht(g.invoiceAmount) }}</td>
                  <td class="num" style="color:var(--green)">{{ compactBaht(g.chequeAmount) }}</td>
                  <td class="num">{{ compactBaht(g.awaitingAmount) }}</td>
                  <td class="num">{{ percent(g.collectionRate) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="empty">ไม่มีข้อมูล</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (tab() === 'aging') {
      <div class="grid" style="grid-template-columns:1fr 1.4fr;align-items:start">
        <div class="card">
          <div class="card-head"><h2>ช่วงอายุหนี้</h2></div>
          <div class="card-body">
            @for (a of aging(); track a.bucket) {
              <div style="margin-bottom:14px">
                <div class="row between small">
                  <span>{{ a.label }} <span class="muted">({{ a.count }} ใบ)</span></span>
                  <b>{{ baht(a.amount) }}</b>
                </div>
                <div class="progress" [class.red]="a.bucket === 'GT90'"><span [style.width.%]="agingWidth(a)"></span></div>
              </div>
            }
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>ใบแจ้งหนี้ที่ยังไม่ได้รับเช็ค (เรียงตามอายุหนี้)</h2></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>เลขที่</th><th>โรงพยาบาล</th><th>ครบกำหนด</th><th class="num">คงค้าง</th><th class="num">เกิน (วัน)</th></tr></thead>
              <tbody>
                @for (u of unpaid(); track u.id) {
                  <tr class="clickable" [routerLink]="['/invoices', u.id]">
                    <td class="mono small">{{ u.invoiceNo }}</td>
                    <td class="small">{{ u.hospitalName }}</td>
                    <td class="small">{{ thaiDateShort(u.dueDate) }}</td>
                    <td class="num">{{ baht(u.outstandingAmount) }}</td>
                    <td class="num" [style.color]="u.daysOverdue > 0 ? 'var(--red)' : ''">{{ u.daysOverdue || '—' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="empty">ไม่มีหนี้ค้าง</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    }

    @if (tab() === 'delivery') {
      <div class="card">
        <div class="card-head">
          <h2>ความครบถ้วนของการจัดส่งใบแจ้งหนี้</h2>
          <span class="small muted">สัญญาที่มีใบแจ้งหนี้แต่ยังไม่ได้บันทึกการส่ง</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>สัญญา</th><th>โรงพยาบาล</th><th>ผู้แทน</th><th class="num">ใบแจ้งหนี้</th><th class="num">ส่งแล้ว</th><th class="num">ยังไม่ส่ง</th><th></th></tr></thead>
            <tbody>
              @for (d of delivery(); track d.contractId) {
                <tr>
                  <td class="mono small">{{ d.contractNo }}</td>
                  <td>{{ d.hospitalName }}</td>
                  <td class="small">{{ d.repName }}</td>
                  <td class="num">{{ d.invoiceCount }}</td>
                  <td class="num" style="color:var(--green)">{{ d.deliveredCount }}</td>
                  <td class="num" [style.color]="d.undeliveredCount ? 'var(--red)' : ''">{{ d.undeliveredCount }}</td>
                  <td><a class="btn sm" [routerLink]="['/contracts', d.contractId]">ดูสัญญา</a></td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty">ไม่พบข้อมูล</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (tab() === 'uninvoiced') {
      <div class="card">
        <div class="card-head">
          <h2>งวดที่ถึงรอบแล้วแต่ยังไม่ได้ส่งใบแจ้งหนี้</h2>
          <span class="chip amber">{{ uninvoiced().length }} งวด</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>สัญญา</th><th>โรงพยาบาล</th><th class="num">งวด</th><th>ช่วงงวด</th><th class="num">มูลค่าโดยประมาณ</th><th class="num">เลยกำหนด (วัน)</th><th>ผู้แทน</th><th></th></tr></thead>
            <tbody>
              @for (p of uninvoiced(); track p.id) {
                <tr>
                  <td class="mono small">{{ p.contractNo }}</td>
                  <td class="small">{{ p.hospitalName }}</td>
                  <td class="num">{{ p.periodNo }}</td>
                  <td class="small">{{ thaiDate(p.periodStart) }} – {{ thaiDate(p.periodEnd) }}</td>
                  <td class="num">{{ baht(p.estimatedAmount) }}</td>
                  <td class="num" [style.color]="p.daysOverdue > 0 ? 'var(--red)' : ''">{{ p.daysOverdue || '—' }}</td>
                  <td class="small">{{ p.repName }}</td>
                  <td><a class="btn sm" [routerLink]="['/contracts', p.contractId]">เปิดสัญญา</a></td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty">ไม่มีงวดค้างแจ้งหนี้</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (tab() === 'unpaid') {
      <div class="card">
        <div class="card-head">
          <h2>ใบแจ้งหนี้ที่ออกแล้วแต่ยังไม่ได้รับเช็ค</h2>
          <span class="chip amber">{{ unpaid().length }} ใบ</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>เลขที่</th><th>โรงพยาบาล</th><th>ผู้แทน</th><th>วันที่ออก</th><th>ครบกำหนด</th><th class="num">ยอดรวม</th><th class="num">คงค้าง</th><th>การส่ง</th></tr></thead>
            <tbody>
              @for (u of unpaid(); track u.id) {
                <tr class="clickable" [routerLink]="['/invoices', u.id]">
                  <td class="mono small">{{ u.invoiceNo }}</td>
                  <td class="small">{{ u.hospitalName }}</td>
                  <td class="small">{{ u.repName }}</td>
                  <td class="small">{{ thaiDateShort(u.issueDate) }}</td>
                  <td class="small">{{ thaiDateShort(u.dueDate) }}</td>
                  <td class="num">{{ baht(u.totalAmount) }}</td>
                  <td class="num" style="color:var(--amber)">{{ baht(u.outstandingAmount) }}</td>
                  <td class="small">{{ u.lastDeliveredOn ? thaiDateShort(u.lastDeliveredOn) : 'ยังไม่ส่ง' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty">ไม่มีใบแจ้งหนี้ค้างรับ</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class ReportsComponent {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly tab = signal<Tab>('rep');
  readonly groups = signal<GroupRow[]>([]);
  readonly aging = signal<AgingRow[]>([]);
  readonly delivery = signal<DeliveryCoverageRow[]>([]);
  readonly uninvoiced = signal<UninvoicedPeriod[]>([]);
  readonly unpaid = signal<UnpaidInvoice[]>([]);
  readonly regions = signal<Region[]>([]);
  readonly reps = signal<User[]>([]);

  asOf = new Date().toISOString().slice(0, 10);
  regionId: number | null = null;
  repId: string | null = null;

  readonly baht = baht;
  readonly compactBaht = compactBaht;
  readonly percent = percent;
  readonly thaiDate = thaiDate;
  readonly thaiDateShort = thaiDateShort;

  constructor() {
    this.api.regions().subscribe((r) => this.regions.set(r));
    this.api.users().subscribe((u) => this.reps.set(u.filter((x) => x.role === 'REP')));
    this.loadAll();
  }

  private filters() {
    return { as_of: this.asOf, region_id: this.regionId, rep_id: this.repId };
  }

  setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'rep' || t === 'hospital') this.loadGroups();
  }

  private loadGroups() {
    const f = this.filters();
    const req = this.tab() === 'hospital' ? this.api.byHospital(f) : this.api.byRep(f);
    req.subscribe((r) => this.groups.set(r));
  }

  loadAll() {
    const f = this.filters();
    this.loadGroups();
    this.api.aging(f).subscribe((r) => this.aging.set(r));
    this.api.deliveryCoverage(f).subscribe((r) => this.delivery.set(r));
    this.api.uninvoicedPeriods(f).subscribe((r) => this.uninvoiced.set(r));
    this.api.unpaidInvoices(f).subscribe((r) => this.unpaid.set(r));
  }

  agingWidth(a: AgingRow) {
    const max = Math.max(...this.aging().map((x) => x.amount), 1);
    return (a.amount / max) * 100;
  }

  exportCsv() {
    const rows = this.groups();
    if (!rows.length) return;
    const header = ['ชื่อ', 'รายละเอียด', 'งวดทั้งหมด', 'แจ้งแล้ว', 'ค้างแจ้ง(งวด)', 'มูลค่าคงเหลือ', 'แจ้งหนี้รวม', 'รับเช็คแล้ว', 'ค้างรับ', 'อัตราเก็บ(%)'];
    const body = rows.map((g) => [
      g.name, g.subLabel, g.totalPeriods, g.invoicedPeriods, g.dueNotInvoicedPeriods,
      g.remainingValue, g.invoiceAmount, g.chequeAmount, g.awaitingAmount, g.collectionRate,
    ]);
    const csv = [header, ...body].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${this.tab()}-${this.asOf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
