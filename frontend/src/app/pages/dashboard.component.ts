import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Overview, Region, UninvoicedPeriod, UnpaidInvoice, User } from '../core/models';
import { baht, compactBaht, money, percent, thaiDate, thaiDateShort } from '../core/format';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <h1>ภาพรวมการติดตามหนี้</h1>
        <p>สรุปสถานะการแจ้งหนี้ การรับเช็ค และอายุหนี้ ข้อมูล ณ วันที่ {{ thaiDate(overview()?.asOf) }}</p>
      </div>
      <div class="filters">
        @if (!auth.isRep()) {
        <div class="field">
          <label>ภาค</label>
          <select [(ngModel)]="regionId" (ngModelChange)="load()">
            <option [ngValue]="null">ทุกภาค</option>
            @for (r of regions(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
          </select>
        </div>
        }
        @if (!auth.isRep()) {
        <div class="field">
          <label>ผู้แทน</label>
          <select [(ngModel)]="repId" (ngModelChange)="load()">
            <option [ngValue]="null">ทุกคน</option>
            @for (u of reps(); track u.id) { <option [ngValue]="u.id">{{ u.fullName }}</option> }
          </select>
        </div>
        }
        <button class="btn" (click)="load()">↻ รีเฟรช</button>
      </div>
    </div>

    @if (loading()) {
      <div class="card"><div class="empty">กำลังโหลดข้อมูล…</div></div>
    } @else if (overview(); as ov) {
      <!-- KPI -->
      <div class="grid grid-kpi" style="margin-bottom:14px">
        <div class="kpi violet">
          <div class="bar"></div>
          <div class="label">งวดที่ยังไม่แจ้งหนี้</div>
          <div class="value">{{ ov.kpi.notInvoicedPeriods }}<small> / {{ ov.kpi.totalPeriods }} งวด</small></div>
          <div class="meta">ถึงรอบแล้ว {{ ov.kpi.dueNotInvoicedPeriods }} งวด · {{ baht(ov.kpi.dueNotInvoicedAmount) }}</div>
        </div>
        <div class="kpi">
          <div class="bar"></div>
          <div class="label">มูลค่าคงเหลือในสัญญา</div>
          <div class="value">{{ compactBaht(ov.kpi.remainingValue) }}</div>
          <div class="meta">ยังไม่ออกใบแจ้งหนี้ · ไม่รวม VAT</div>
        </div>
        <div class="kpi">
          <div class="bar"></div>
          <div class="label">ใบแจ้งหนี้ที่ออกแล้ว</div>
          <div class="value">{{ ov.kpi.invoiceCount }}<small> ใบ</small></div>
          <div class="meta">{{ baht(ov.kpi.invoiceAmount) }}</div>
        </div>
        <div class="kpi green">
          <div class="bar"></div>
          <div class="label">รับเช็คแล้ว</div>
          <div class="value">{{ compactBaht(ov.kpi.chequeAmount) }}</div>
          <div class="meta">คิดเป็น {{ percent(ov.kpi.collectionRate) }} ของยอดที่ออกใบแจ้งหนี้</div>
        </div>
        <div class="kpi amber">
          <div class="bar"></div>
          <div class="label">รอรับเช็ค</div>
          <div class="value">{{ ov.kpi.awaitingCount }}<small> ใบ</small></div>
          <div class="meta">{{ baht(ov.kpi.awaitingAmount) }}</div>
        </div>
        <div class="kpi red">
          <div class="bar"></div>
          <div class="label">เกินกำหนดชำระ</div>
          <div class="value">{{ ov.kpi.overdueCount }}<small> ใบ</small></div>
          <div class="meta">{{ baht(ov.kpi.overdueAmount) }}</div>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom:14px;align-items:start">
        <!-- aging -->
        <div class="card" style="grid-column: span 2">
          <div class="card-head"><h2>อายุหนี้ (Aging)</h2><span class="small muted">นับจากวันครบกำหนดชำระ</span></div>
          <div class="card-body">
            <div class="bar-chart">
              @for (a of ov.aging; track a.bucket) {
                <div class="col">
                  <div class="val">{{ compactBaht(a.amount) }}</div>
                  <div class="bar" [style.height.%]="barHeight(a.amount)"
                       [style.background]="a.bucket === 'NOT_DUE' ? '#8fa6c2' : a.bucket === 'D1_30' ? '#d99a2b' : a.bucket === 'D31_60' ? '#e07a2b' : a.bucket === 'D61_90' ? '#d9534f' : '#a32020'"></div>
                  <div class="cap">{{ a.label }}<br /><b>{{ a.count }} ใบ</b></div>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- delivery coverage -->
        <div class="card">
          <div class="card-head"><h2>การส่งใบแจ้งหนี้</h2></div>
          <div class="card-body">
            <div class="row between" style="margin-bottom:6px">
              <span class="muted small">ส่งแล้ว {{ ov.kpi.deliveredCount }} จาก {{ ov.kpi.invoiceCount }} ใบ</span>
              <b>{{ percent(ov.kpi.deliveryRate) }}</b>
            </div>
            <div class="progress green"><span [style.width.%]="ov.kpi.deliveryRate"></span></div>
            <div class="divider"></div>
            <div class="row between"><span class="muted small">ยังไม่ส่ง / ไม่มีหลักฐานส่ง</span><b style="color:var(--amber)">{{ ov.kpi.undeliveredCount }} ใบ</b></div>
            <div class="row between" style="margin-top:8px"><span class="muted small">มูลค่ายังไม่ส่ง</span><b>{{ baht(ov.kpi.undeliveredAmount) }}</b></div>
            <div class="divider"></div>
            <div class="row between"><span class="muted small">ใบแจ้งหนี้ที่ยังไม่แนบไฟล์</span><b>{{ ov.kpi.invoicesWithoutFile }} ใบ</b></div>
            <div class="row between" style="margin-top:8px"><span class="muted small">สัญญาใกล้หมดอายุ (90 วัน)</span><b>{{ ov.kpi.expiringSoonCount }} สัญญา</b></div>
          </div>
        </div>
      </div>

      <!-- by rep -->
      <div class="card" style="margin-bottom:14px">
        <div class="card-head">
          <h2>สรุปตามผู้แทนพื้นที่</h2>
          <a routerLink="/reports" class="small">ดูรายงานทั้งหมด →</a>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ผู้แทน</th><th class="num">โรงพยาบาล</th>
                <th class="num">งวดยังไม่แจ้ง</th><th class="num">มูลค่าคงเหลือ</th>
                <th class="num">ออกใบแจ้งหนี้</th><th class="num">รับเช็คแล้ว</th>
                <th class="num">ค้างรับ</th><th class="num">เกินกำหนด</th><th style="width:120px">อัตราจัดเก็บ</th>
              </tr>
            </thead>
            <tbody>
              @for (r of ov.byRep; track r.id) {
                <tr>
                  <td><b>{{ r.name }}</b><div class="small muted">{{ r.subLabel }}</div></td>
                  <td class="num">{{ r.hospitalCount }}</td>
                  <td class="num">{{ r.dueNotInvoicedPeriods }} <span class="small muted">/ {{ r.totalPeriods }}</span></td>
                  <td class="num">{{ compactBaht(r.remainingValue) }}</td>
                  <td class="num">{{ baht(r.invoiceAmount) }}</td>
                  <td class="num" style="color:var(--green)">{{ baht(r.chequeAmount) }}</td>
                  <td class="num" style="color:var(--amber)">{{ baht(r.awaitingAmount) }}</td>
                  <td class="num" style="color:var(--red)">{{ baht(r.invoiceOverdueAmount) }}</td>
                  <td>
                    <div class="row" style="gap:6px">
                      <div class="progress" style="flex:1"><span [style.width.%]="r.collectionRate"></span></div>
                      <span class="small">{{ percent(r.collectionRate, 0) }}</span>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="empty">ยังไม่มีข้อมูล</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-2">
        <!-- uninvoiced list -->
        <div class="card">
          <div class="card-head">
            <h2>งวดที่ถึงรอบแล้วแต่ยังไม่แจ้งหนี้</h2>
            <span class="chip amber">{{ uninvoiced().length }} รายการ</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>โรงพยาบาล / สัญญา</th><th>งวด</th><th class="num">มูลค่า</th><th>เกินกำหนด</th></tr></thead>
              <tbody>
                @for (p of uninvoiced().slice(0, 8); track p.id) {
                  <tr class="clickable" [routerLink]="['/contracts', p.contractId]">
                    <td><b>{{ p.hospitalName }}</b><div class="small muted">{{ p.contractNo }} · {{ p.repName }}</div></td>
                    <td>{{ thaiDate(p.periodStart) }}</td>
                    <td class="num">{{ baht(p.estimatedAmount) }}</td>
                    <td>
                      @if (p.daysOverdue > 0) {
                        <span class="chip red">{{ p.daysOverdue }} วัน</span>
                      } @else {
                        <span class="chip">ตามกำหนด</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="empty">ไม่มีงวดค้างแจ้งหนี้</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- unpaid invoices -->
        <div class="card">
          <div class="card-head">
            <h2>ใบแจ้งหนี้ที่ยังไม่ได้รับเช็ค</h2>
            <a routerLink="/invoices" class="small">ดูทั้งหมด →</a>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>เลขที่ / โรงพยาบาล</th><th>ครบกำหนด</th><th class="num">ค้างรับ</th><th>สถานะ</th></tr></thead>
              <tbody>
                @for (i of unpaid().slice(0, 8); track i.id) {
                  <tr class="clickable" [routerLink]="['/invoices', i.id]">
                    <td><b class="mono">{{ i.invoiceNo }}</b><div class="small muted">{{ i.hospitalName }}</div></td>
                    <td>{{ thaiDateShort(i.dueDate) }}</td>
                    <td class="num">{{ baht(i.outstandingAmount) }}</td>
                    <td>
                      @if (i.daysOverdue > 90) { <span class="chip red">เกิน {{ i.daysOverdue }} วัน</span> }
                      @else if (i.daysOverdue > 0) { <span class="chip amber">{{ i.daysOverdue }} วัน</span> }
                      @else { <span class="chip">ยังไม่ครบกำหนด</span> }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="empty">ไม่มีใบแจ้งหนี้ค้างรับ</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    }
  `,
})
export class DashboardComponent {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly overview = signal<Overview | null>(null);
  readonly regions = signal<Region[]>([]);
  readonly reps = signal<User[]>([]);
  readonly uninvoiced = signal<UninvoicedPeriod[]>([]);
  readonly unpaid = signal<UnpaidInvoice[]>([]);
  readonly loading = signal(true);

  regionId: number | null = null;
  repId: string | null = null;

  readonly baht = baht;
  readonly compactBaht = compactBaht;
  readonly percent = percent;
  readonly money = money;
  readonly thaiDate = thaiDate;
  readonly thaiDateShort = thaiDateShort;

  readonly maxAging = computed(() => Math.max(1, ...(this.overview()?.aging.map((a) => a.amount) ?? [1])));

  constructor() {
    forkJoin({ regions: this.api.regions(), users: this.api.users() }).subscribe({
      next: ({ regions, users }) => {
        this.regions.set(regions);
        this.reps.set(users.filter((u) => u.role === 'REP'));
        this.load();
      },
      error: () => this.load(),
    });
  }

  barHeight(amount: number): number {
    return Math.max(3, Math.round((amount / this.maxAging()) * 100));
  }

  load() {
    this.loading.set(true);
    const params = { region_id: this.regionId, rep_id: this.repId };
    forkJoin({
      overview: this.api.overview(params),
      uninvoiced: this.api.uninvoicedPeriods({ ...params, limit: 50 }),
      unpaid: this.api.unpaidInvoices({ ...params, limit: 50 }),
    }).subscribe({
      next: (res) => {
        this.overview.set(res.overview);
        this.uninvoiced.set(res.uninvoiced);
        this.unpaid.set(res.unpaid);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
