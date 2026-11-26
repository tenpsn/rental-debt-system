import { Component, OnInit, inject, input, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { errorMessage } from '../core/auth.interceptor';
import { ChequeDetail } from '../core/models';
import {
  CHEQUE_DELIVERY_LABEL, CHEQUE_STATUS_LABEL, PAYMENT_STATE_LABEL,
  baht, fileIcon, fileSize, thaiDate, thaiDateShort, thaiDateTime,
} from '../core/format';

@Component({
  selector: 'app-cheque-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (ch(); as c) {
      <div class="page-head">
        <div>
          <a routerLink="/cheques" class="small">← กลับไปรายการเช็ค</a>
          <h1 class="mono">เช็ค {{ c.chequeNo }}</h1>
          <p>{{ c.hospitalName }} · {{ c.bankName }}{{ c.bankBranch ? ' สาขา' + c.bankBranch : '' }}</p>
        </div>
        @if (auth.canInvoice()) {
          <div class="row wrap">
            <select [(ngModel)]="newStatus" style="width:170px">
              <option value="RECEIVED">รับเช็คแล้ว</option>
              <option value="DEPOSITED">นำฝากแล้ว</option>
              <option value="CLEARED">เงินเข้าแล้ว</option>
              <option value="BOUNCED">เช็คเด้ง</option>
              <option value="RETURNED">คืนเช็ค</option>
            </select>
            <button class="btn primary" (click)="updateStatus()" [disabled]="busy()">อัปเดตสถานะ</button>
          </div>
        }
      </div>

      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="kpi">
          <div class="bar"></div>
          <div class="label">ยอดเช็ค</div>
          <div class="value">{{ baht(c.amount) }}</div>
          <div class="meta">วันที่หน้าเช็ค {{ thaiDate(c.chequeDate) }}</div>
        </div>
        <div class="kpi green">
          <div class="bar"></div>
          <div class="label">ตัดชำระแล้ว</div>
          <div class="value">{{ baht(c.allocatedAmount) }}</div>
          <div class="meta">{{ c.invoiceCount }} ใบแจ้งหนี้</div>
        </div>
        <div class="kpi amber">
          <div class="bar"></div>
          <div class="label">วันที่รับเช็ค</div>
          <div class="value" style="font-size:20px">{{ thaiDate(c.receivedDate) }}</div>
          <div class="meta">ผู้รับ {{ c.receivedByName || '—' }}</div>
        </div>
        <div class="kpi" [class.violet]="!c.atCompany">
          <div class="bar"></div>
          <div class="label">ถึงบริษัท</div>
          <div class="value" style="font-size:20px">{{ c.atCompany ? thaiDate(c.companyReceivedDate) : 'ยังไม่ถึง' }}</div>
          <div class="meta">{{ deliveryLabel(c.deliveryMethod) }}</div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1.3fr 1fr;align-items:start">
        <div class="card">
          <div class="card-head">
            <h2>รายการตัดชำระ</h2>
            <span class="chip" [class.green]="c.status === 'CLEARED'" [class.blue]="c.status === 'RECEIVED'"
                  [class.violet]="c.status === 'DEPOSITED'" [class.red]="c.status === 'BOUNCED' || c.status === 'RETURNED'">
              {{ statusLabel(c.status) }}
            </span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ใบแจ้งหนี้</th><th>วันที่ออก</th><th>ครบกำหนด</th><th class="num">ยอดใบ</th><th class="num">ตัดชำระ</th><th>สถานะใบ</th></tr></thead>
              <tbody>
                @for (a of c.allocations; track a.id) {
                  <tr class="clickable" [routerLink]="['/invoices', a.invoiceId]">
                    <td class="mono small">{{ a.invoiceNo }}</td>
                    <td class="small">{{ thaiDateShort(a.issueDate) }}</td>
                    <td class="small">{{ thaiDateShort(a.dueDate) }}</td>
                    <td class="num">{{ baht(a.invoiceTotal) }}</td>
                    <td class="num"><b>{{ baht(a.amount) }}</b></td>
                    <td><span [class]="'chip ' + paymentTone(a.paymentState)">{{ paymentState(a.paymentState) }}</span></td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="empty small">เช็คนี้ยังไม่ถูกตัดชำระใบแจ้งหนี้ใด</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="card">
            <div class="card-head"><h2>ข้อมูลเช็ค</h2></div>
            <div class="card-body">
              <dl class="kv">
                <dt>ธนาคาร</dt><dd>{{ c.bankName }} {{ c.bankBranch || '' }}</dd>
                <dt>เลขที่เช็ค</dt><dd class="mono">{{ c.chequeNo }}</dd>
                <dt>วันที่หน้าเช็ค</dt><dd>{{ thaiDate(c.chequeDate) }}</dd>
                <dt>วันที่รับ</dt><dd>{{ thaiDate(c.receivedDate) }}</dd>
                <dt>วิธีนำส่ง</dt><dd>{{ deliveryLabel(c.deliveryMethod) }}</dd>
                <dt>ถึงบริษัท</dt><dd>{{ c.atCompany ? thaiDate(c.companyReceivedDate) : 'ยังไม่ถึงบริษัท' }}</dd>
                @if (c.note) { <dt>หมายเหตุ</dt><dd>{{ c.note }}</dd> }
              </dl>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h2>ไฟล์ scan เช็ค</h2>
              <label class="btn sm primary" style="cursor:pointer">
                + อัปโหลด
                <input type="file" accept=".pdf,image/*" hidden (change)="upload(c.id, $event)" />
              </label>
            </div>
            <div class="card-body">
              <div class="file-list">
                @for (f of c.attachments; track f.id) {
                  <div class="file-item">
                    <a class="file-pill" href="#" [title]="f.fileName" (click)="openFile($event, f.id)">
                      <span class="file-ico">{{ fileIcon(f.mimeType) }}</span>
                      <span>
                        <b>{{ f.fileName }}</b>
                        <small class="muted">{{ fileSize(f.sizeBytes) }} · {{ thaiDateTime(f.createdAt) }}</small>
                      </span>
                    </a>
                    @if (auth.canDeleteAttachment()) {
                      <button type="button" class="file-del" title="ลบไฟล์" [attr.aria-label]="'ลบไฟล์ ' + f.fileName"
                              [disabled]="deletingFile()" (click)="deleteFile(f.id, f.fileName)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                      </button>
                    }
                  </div>
                } @empty {
                  <div class="small muted">ยังไม่มีไฟล์ scan เช็ค</div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    } @else {
      @if (loadError()) {
        <div class="card"><div class="empty">
          <div style="margin-bottom:10px">โหลดข้อมูลไม่สำเร็จ: {{ loadError() }}</div>
          <a routerLink="/cheques">← กลับไปรายการเช็ค</a>
        </div></div>
      } @else {
        <div class="card"><div class="empty">กำลังโหลด…</div></div>
      }
    }
  `,
})
export class ChequeDetailComponent implements OnInit {
  // กันกดลบไฟล์ซ้ำระหว่างรอผล
  readonly deletingFile = signal(false);
  // ข้อความเมื่อโหลดข้อมูลหลักของหน้าไม่สำเร็จ
  readonly loadError = signal('');
  // กันกดปุ่มบันทึกซ้ำระหว่างรอผล
  readonly busy = signal(false);
  readonly id = input.required<string>();

  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly ch = signal<ChequeDetail | null>(null);
  newStatus = 'RECEIVED';

  readonly baht = baht;
  readonly thaiDate = thaiDate;
  readonly thaiDateShort = thaiDateShort;
  readonly thaiDateTime = thaiDateTime;
  readonly fileSize = fileSize;
  readonly fileIcon = fileIcon;
  readonly statusLabel = (s: string) => CHEQUE_STATUS_LABEL[s]?.text ?? s;
  readonly deliveryLabel = (m: string) => CHEQUE_DELIVERY_LABEL[m] ?? m;
  readonly paymentState = (s: string) => PAYMENT_STATE_LABEL[s]?.text ?? s;
  readonly paymentTone = (s: string) => PAYMENT_STATE_LABEL[s]?.tone ?? '';

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.cheque(this.id()).subscribe({
      next: (c) => {
        this.ch.set(c);
        this.newStatus = c.status;
      },
      error: (e) => this.loadError.set(errorMessage(e)),
    });
  }

  // เปิดไฟล์แนบในแท็บใหม่ ถ้าเปิดไม่ได้ให้แจ้งผู้ใช้
  // ลบไฟล์แนบ ถามยืนยันก่อนเพราะลบแล้วกู้คืนไม่ได้
  deleteFile(attachmentId: string, fileName: string) {
    if (this.deletingFile()) return;
    if (!confirm(`ลบไฟล์ "${fileName}" หรือไม่ ลบแล้วกู้คืนไม่ได้`)) return;
    this.deletingFile.set(true);
    this.api.deleteAttachment(attachmentId).pipe(finalize(() => this.deletingFile.set(false))).subscribe({
      next: () => {
        this.toast.success('ลบไฟล์แล้ว');
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  openFile(event: Event, attachmentId: string) {
    event.preventDefault();
    this.api.openAttachment(attachmentId).subscribe();
  }

  updateStatus() {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.updateCheque(this.id(), { status: this.newStatus }).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.toast.success('อัปเดตสถานะเช็คแล้ว');
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  upload(chequeId: string, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // ล้างช่องเลือกไฟล์ทันที ไม่ว่าอัปโหลดสำเร็จหรือไม่ จะได้เลือกไฟล์เดิมซ้ำได้
    input.value = '';
    this.api.uploadAttachment('CHEQUE', chequeId, file).subscribe({
      next: () => {
        this.toast.success('อัปโหลดไฟล์แล้ว');
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
