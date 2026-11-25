import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Contract, Region, User } from '../core/models';
import { BILLING_CYCLE_LABEL, CONTRACT_TYPE_LABEL, baht, compactBaht, percent, thaiDate } from '../core/format';

@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <h1>สัญญาเช่า / ใบสั่งจ้าง</h1>
        <p>ติดตามงวดการเรียกเก็บทั้งหมดในสัญญา และส่วนที่ยังไม่ได้แจ้งหนี้</p>
      </div>
      @if (auth.canEdit()) {
        <a class="btn primary" routerLink="/contracts/new">+ สร้างสัญญา</a>
      }
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-body">
        <div class="filters">
          <div class="field" style="flex:1;min-width:220px">
            <label>ค้นหา</label>
            <input [(ngModel)]="search" (ngModelChange)="debouncedLoad()" placeholder="เลขที่สัญญา หรือชื่อโรงพยาบาล" />
          </div>
          <div class="field">
            <label>ภาค</label>
            <select [(ngModel)]="regionId" (ngModelChange)="load()" [disabled]="auth.user()?.role === 'REP'">
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
          <div class="field">
            <label>ประเภท</label>
            <select [(ngModel)]="status" (ngModelChange)="load()">
              <option value="">ทั้งหมด</option>
              <option value="ACTIVE">ใช้งาน</option>
              <option value="COMPLETED">สิ้นสุด</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>เลขที่สัญญา / โรงพยาบาล</th>
              <th>ประเภท</th>
              <th>ระยะสัญญา</th>
              <th class="num">ค่าเช่า</th>
              <th style="width:170px">ความคืบหน้างวด</th>
              <th class="num">ค้างรับ</th>
              <th class="num">มูลค่าคงเหลือ</th>
              <th>ผู้แทน</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="8" class="empty">กำลังโหลด…</td></tr>
            }
            @for (c of contracts(); track c.id) {
              <tr class="clickable" [routerLink]="['/contracts', c.id]">
                <td>
                  <b class="mono">{{ c.contractNo }}</b>
                  <div class="small muted">{{ c.hospitalName }}</div>
                </td>
                <td>
                  <span class="chip">{{ contractType(c.contractType) }}</span>
                  <div class="small muted" style="margin-top:3px">{{ c.pricingMode === 'FIXED' ? 'เหมารายงวด' : 'จ่ายตามใช้' }}</div>
                </td>
                <td>
                  <div>{{ thaiDate(c.startDate) }}</div>
                  <div class="small muted">ถึง {{ thaiDate(c.endDate) }} · {{ cycle(c.billingCycle) }}</div>
                </td>
                <td class="num">
                  @if (c.pricingMode === 'FIXED') {
                    {{ baht(c.periodAmount) }}<div class="small muted">/ งวด</div>
                  } @else {
                    {{ baht(c.unitPrice) }}<div class="small muted">/ {{ c.unitName || 'หน่วย' }}</div>
                  }
                </td>
                <td>
                  <div class="row between small" style="margin-bottom:4px">
                    <span>{{ c.invoicedPeriods }}/{{ c.totalPeriods }} งวด</span>
                    <span class="muted">{{ percent(c.totalPeriods ? (c.invoicedPeriods / c.totalPeriods) * 100 : 0, 0) }}</span>
                  </div>
                  <div class="progress"><span [style.width.%]="c.totalPeriods ? (c.invoicedPeriods / c.totalPeriods) * 100 : 0"></span></div>
                </td>
                <td class="num" style="color:var(--amber)">{{ compactBaht(c.outstandingAmount) }}</td>
                <td class="num">{{ compactBaht(c.remainingValue) }}</td>
                <td>{{ c.repName || '—' }}<div class="small muted">{{ c.regionName }}</div></td>
              </tr>
            } @empty {
              @if (!loading()) {
                <tr><td colspan="8" class="empty">ไม่พบสัญญาตามเงื่อนไข</td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ContractsComponent {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly contracts = signal<Contract[]>([]);
  readonly regions = signal<Region[]>([]);
  readonly reps = signal<User[]>([]);
  readonly loading = signal(true);

  search = '';
  regionId: number | null = null;
  repId: string | null = null;
  status = '';

  readonly baht = baht;
  readonly compactBaht = compactBaht;
  readonly percent = percent;
  readonly thaiDate = thaiDate;
  readonly contractType = (t: string) => CONTRACT_TYPE_LABEL[t] ?? t;
  readonly cycle = (c: string) => BILLING_CYCLE_LABEL[c] ?? c;

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.api.regions().subscribe((r) => this.regions.set(r));
    this.api.users().subscribe((u) => this.reps.set(u.filter((x) => x.role === 'REP')));
    this.load();
  }

  debouncedLoad() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 350);
  }

  load() {
    this.loading.set(true);
    this.api
      .contracts({ search: this.search, region_id: this.regionId, rep_id: this.repId, status: this.status })
      .subscribe({
        next: (rows) => {
          this.contracts.set(rows);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
