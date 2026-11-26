import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { errorMessage } from '../core/auth.interceptor';
import { InvoiceDetail } from '../core/models';
import { DateInputComponent } from '../core/date-input.component';
import {
  CHEQUE_STATUS_LABEL, DELIVERY_METHOD_LABEL, DELIVERY_STATUS_LABEL, PAYMENT_STATE_LABEL,
  baht, fileIcon, fileSize, percent, thaiDate, thaiDateShort, thaiDateTime,
  todayIso,
} from '../core/format';
import { ModalDirective } from '../core/modal.directive';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DateInputComponent, ModalDirective],
  template: `
    @if (inv(); as i) {
      <div class="page-head">
        <div>
          <a routerLink="/invoices" class="small">← กลับไปรายการใบแจ้งหนี้</a>
          <h1 class="mono">{{ i.invoiceNo }}</h1>
          <p>
            {{ i.hospitalName }} · สัญญา
            <a [routerLink]="['/contracts', i.contractId]" class="mono">{{ i.contractNo }}</a>
            @if (i.periodNo) { · งวดที่ {{ i.periodNo }} }
          </p>
        </div>
        <div class="row wrap">
          <button class="btn primary" (click)="openDelivery()">+ บันทึกการจัดส่ง</button>
          @if (auth.canCancelInvoice() && i.status !== 'CANCELLED') {
            <button class="btn danger" (click)="cancel()">ยกเลิกใบแจ้งหนี้</button>
          }
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="kpi">
          <div class="bar"></div>
          <div class="label">ยอดรวมทั้งสิ้น</div>
          <div class="value">{{ baht(i.totalAmount) }}</div>
          <div class="meta">ก่อน VAT {{ baht(i.amount) }} · VAT {{ baht(i.vatAmount) }}</div>
        </div>
        <div class="kpi green">
          <div class="bar"></div>
          <div class="label">รับเช็คแล้ว</div>
          <div class="value">{{ baht(i.chequeReceivedAmount) }}</div>
          <div class="meta">{{ percent(i.totalAmount ? (i.chequeReceivedAmount / i.totalAmount) * 100 : 0) }} ของใบนี้</div>
        </div>
        <div class="kpi amber">
          <div class="bar"></div>
          <div class="label">คงค้าง</div>
          <div class="value">{{ baht(i.outstandingAmount) }}</div>
          <div class="meta">สถานะ {{ stateLabel(i.paymentState) }}</div>
        </div>
        <div class="kpi" [class.red]="i.daysOverdue > 0">
          <div class="bar"></div>
          <div class="label">ครบกำหนด / อายุหนี้</div>
          <div class="value" style="font-size:20px">{{ thaiDate(i.dueDate) }}</div>
          <div class="meta">{{ i.daysOverdue > 0 ? 'เกินกำหนด ' + i.daysOverdue + ' วัน' : 'ยังไม่เกินกำหนด' }}</div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1.35fr 1fr;align-items:start;margin-bottom:14px">
        <div class="card">
          <div class="card-head">
            <h2>ประวัติการจัดส่ง</h2>
            <span class="chip" [class.green]="i.deliveryCount > 0" [class.amber]="!i.deliveryCount">
              {{ i.deliveryCount > 0 ? 'ส่งแล้ว ' + i.deliveryCount + ' ครั้ง' : 'ยังไม่ส่ง' }}
            </span>
          </div>
          <div class="card-body">
            <div class="timeline">
              @for (d of i.deliveries; track d.id) {
                <div class="tl-item">
                  <div class="tl-dot"></div>
                  <div class="tl-body">
                    <div class="row between">
                      <span class="row" style="gap:6px">
                        <b>{{ methodLabel(d.method) }}</b>
                        @if (deliveryStatus(d.status); as st) { <span [class]="'chip ' + st.tone">{{ st.text }}</span> }
                      </span>
                      <span class="row" style="gap:4px">
                        <span class="small muted">{{ thaiDate(d.deliveredOn) }}</span>
                        @if (auth.canDeleteDelivery()) {
                          <button type="button" class="icon-del" title="ลบประวัติการจัดส่ง"
                                  [attr.aria-label]="'ลบประวัติการจัดส่งวันที่ ' + thaiDate(d.deliveredOn)"
                                  [disabled]="deletingDelivery()" (click)="deleteDelivery(d.id, d.deliveredOn)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                          </button>
                        }
                      </span>
                    </div>
                    <div class="small" style="margin-top:3px">
                      ถึง {{ d.recipientType === 'REP' ? 'ผู้แทน' : d.recipientType === 'HOSPITAL' ? 'โรงพยาบาล' : 'อื่น ๆ' }}
                      {{ d.recipientName ? '· ' + d.recipientName : '' }}
                    </div>
                    @if (d.courierName || d.trackingNo) {
                      <div class="small muted">ขนส่ง {{ d.courierName || '—' }} · เลขพัสดุ {{ d.trackingNo || '—' }}</div>
                    }
                    @if (d.note) { <div class="small muted">หมายเหตุ: {{ d.note }}</div> }
                    <div class="small muted" style="margin-top:2px">บันทึกโดย {{ d.recordedByName || '—' }}</div>
                  </div>
                </div>
              } @empty {
                <div class="empty small">ยังไม่มีประวัติการจัดส่ง</div>
              }
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="card">
            <div class="card-head"><h2>ข้อมูลใบแจ้งหนี้</h2></div>
            <div class="card-body">
              <dl class="kv">
                <dt>วันที่ออก</dt><dd>{{ thaiDate(i.issueDate) }}</dd>
                <dt>ช่วงงวด</dt><dd>{{ thaiDate(i.periodStart) }} – {{ thaiDate(i.periodEnd) }}</dd>
                <dt>รูปแบบ</dt><dd>{{ i.pricingMode === 'FIXED' ? 'เหมารายงวด' : 'จ่ายตามใช้' }}</dd>
                @if (i.usageQty) { <dt>ปริมาณ</dt><dd>{{ i.usageQty }}</dd> }
                <dt>ผู้รับผิดชอบ</dt><dd>{{ i.repName || '—' }}</dd>
                @if (i.note) { <dt>หมายเหตุ</dt><dd>{{ i.note }}</dd> }
              </dl>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h2>เช็คที่ตัดชำระใบนี้</h2>
              <span class="small muted">{{ i.cheques.length }} รายการ</span>
            </div>
            <div class="card-body" style="padding:0">
              <table>
                <thead><tr><th>เลขที่เช็ค</th><th>วันที่รับ</th><th class="num">ยอดตัด</th><th>สถานะ</th></tr></thead>
                <tbody>
                  @for (c of i.cheques; track c.id) {
                    <tr class="clickable" [routerLink]="['/cheques', c.id]">
                      <td class="mono small">{{ c.chequeNo }}<div class="muted">{{ c.bankName }}</div></td>
                      <td class="small">{{ thaiDateShort(c.receivedDate) }}</td>
                      <td class="num">{{ baht(c.allocatedAmount) }}</td>
                      <td><span [class]="'chip ' + chequeTone(c.status)">{{ chequeState(c.status) }}</span></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="empty small">ยังไม่ได้รับเช็ค</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>ไฟล์แนบ (PDF ใบแจ้งหนี้)</h2>
          <label class="btn sm primary" style="cursor:pointer">
            + อัปโหลดไฟล์
            <input type="file" accept=".pdf,image/*" hidden (change)="upload(i.id, $event)" />
          </label>
        </div>
        <div class="card-body">
          <div class="file-list">
            @for (f of i.attachments; track f.id) {
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
              <div class="small muted">ยังไม่มีไฟล์แนบ — แนบ PDF ใบแจ้งหนี้เพื่อให้ตรวจสอบย้อนหลังได้</div>
            }
          </div>
        </div>
      </div>
    } @else {
      @if (loadError()) {
        <div class="card"><div class="empty">
          <div style="margin-bottom:10px">โหลดข้อมูลไม่สำเร็จ: {{ loadError() }}</div>
          <a routerLink="/invoices">← กลับไปรายการใบแจ้งหนี้</a>
        </div></div>
      } @else {
        <div class="card"><div class="empty">กำลังโหลด…</div></div>
      }
    }

    @if (deliveryOpen()) {
      <div class="modal-backdrop" appModal (dismiss)="deliveryOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head"><h2>บันทึกการจัดส่งใบแจ้งหนี้</h2></div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="grid grid-2">
              <div class="field"><label>วันที่ส่ง</label><app-date-input [(ngModel)]="delivery.deliveredOn" /></div>
              <div class="field">
                <label>วิธีจัดส่ง</label>
                <select [(ngModel)]="delivery.method">
                  <option value="COURIER_TO_REP">ขนส่ง → ผู้แทนพื้นที่</option>
                  <option value="COURIER_TO_HOSPITAL">ขนส่ง → โรงพยาบาล</option>
                  <option value="HAND_TO_REP">ผู้แทนรับที่บริษัท</option>
                  <option value="HAND_TO_HOSPITAL">พนักงานนำส่งโรงพยาบาล</option>
                  <option value="EMAIL">อีเมล</option>
                  <option value="POST">ไปรษณีย์</option>
                </select>
              </div>
            </div>
            <div class="grid grid-2">
              <div class="field">
                <label>ผู้รับ</label>
                <select [(ngModel)]="delivery.recipientType">
                  <option value="REP">ผู้แทนพื้นที่</option>
                  <option value="HOSPITAL">โรงพยาบาล</option>
                  <option value="OTHER">อื่น ๆ</option>
                </select>
              </div>
              <div class="field"><label>ชื่อผู้รับ</label><input [(ngModel)]="delivery.recipientName" /></div>
            </div>
            <div class="grid grid-2">
              <div class="field"><label>บริษัทขนส่ง</label><input [(ngModel)]="delivery.courierName" placeholder="Kerry / Flash / ไปรษณีย์ไทย" /></div>
              <div class="field"><label>เลขพัสดุ</label><input [(ngModel)]="delivery.trackingNo" /></div>
            </div>
            <div class="field">
              <label>สถานะ</label>
              <select [(ngModel)]="delivery.status">
                <option value="DELIVERED">ส่งถึงแล้ว</option>
                <option value="IN_TRANSIT">อยู่ระหว่างขนส่ง</option>
                <option value="ACKNOWLEDGED">ผู้รับตอบรับ</option>
                <option value="RETURNED">ตีกลับ</option>
              </select>
            </div>
            <div class="field"><label>หมายเหตุ</label><textarea rows="2" [(ngModel)]="delivery.note"></textarea></div>
          </div>
          <div class="modal-foot">
            <button class="btn" (click)="deliveryOpen.set(false)">ยกเลิก</button>
            <button class="btn primary" (click)="saveDelivery()" [disabled]="busy()">บันทึก</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class InvoiceDetailComponent implements OnInit {
  // กันกดลบไฟล์ซ้ำระหว่างรอผล
  readonly deletingFile = signal(false);
  readonly deletingDelivery = signal(false);
  // ข้อความเมื่อโหลดข้อมูลหลักของหน้าไม่สำเร็จ
  readonly loadError = signal('');
  // กันกดปุ่มบันทึกซ้ำระหว่างรอผล
  readonly busy = signal(false);
  readonly id = input.required<string>();

  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly inv = signal<InvoiceDetail | null>(null);
  readonly deliveryOpen = signal(false);

  readonly baht = baht;
  readonly thaiDate = thaiDate;
  readonly thaiDateShort = thaiDateShort;
  readonly thaiDateTime = thaiDateTime;
  readonly fileSize = fileSize;
  readonly fileIcon = fileIcon;
  readonly percent = percent;
  readonly stateLabel = (s: string) => PAYMENT_STATE_LABEL[s]?.text ?? s;
  readonly methodLabel = (m: string) => DELIVERY_METHOD_LABEL[m] ?? m;
  readonly chequeState = (s: string) => CHEQUE_STATUS_LABEL[s]?.text ?? s;
  readonly chequeTone = (s: string) => CHEQUE_STATUS_LABEL[s]?.tone ?? '';
  readonly deliveryStatus = (s: string) => DELIVERY_STATUS_LABEL[s] ?? null;

  delivery = this.blankDelivery();

  ngOnInit() {
    this.load();
  }

  private blankDelivery() {
    return {
      deliveredOn: todayIso(),
      method: 'COURIER_TO_REP',
      status: 'DELIVERED',
      recipientType: 'REP',
      recipientName: '',
      courierName: '',
      trackingNo: '',
      note: '',
    };
  }

  load() {
    this.api.invoice(this.id()).subscribe({
      next: (i) => this.inv.set(i),
      error: (e) => this.loadError.set(errorMessage(e)),
    });
  }

  // เปิดไฟล์แนบในแท็บใหม่ ถ้าเปิดไม่ได้ให้แจ้งผู้ใช้
  // ลบประวัติการจัดส่งที่บันทึกผิด ถามยืนยันก่อน เพราะเป็นหลักฐานการส่งเอกสาร
  deleteDelivery(deliveryId: string, deliveredOn: string) {
    if (this.deletingDelivery()) return;
    if (!confirm(`ลบประวัติการจัดส่งวันที่ ${thaiDate(deliveredOn)} หรือไม่ ลบแล้วกู้คืนไม่ได้`)) return;
    this.deletingDelivery.set(true);
    this.api.deleteDelivery(this.id(), deliveryId).pipe(finalize(() => this.deletingDelivery.set(false))).subscribe({
      next: () => {
        this.toast.success('ลบประวัติการจัดส่งแล้ว');
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

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

  openDelivery() {
    this.delivery = this.blankDelivery();
    this.deliveryOpen.set(true);
  }

  saveDelivery() {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.addDelivery(this.id(), this.delivery).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.toast.success('บันทึกการจัดส่งแล้ว');
        this.deliveryOpen.set(false);
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  upload(invoiceId: string, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // ล้างช่องเลือกไฟล์ทันที ไม่ว่าอัปโหลดสำเร็จหรือไม่ จะได้เลือกไฟล์เดิมซ้ำได้
    input.value = '';
    this.api.uploadAttachment('INVOICE', invoiceId, file).subscribe({
      next: () => {
        this.toast.success('อัปโหลดไฟล์แล้ว');
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  cancel() {
    if (!confirm('ยืนยันการยกเลิกใบแจ้งหนี้ใบนี้')) return;
    this.api.cancelInvoice(this.id()).subscribe({
      next: () => {
        this.toast.success('ยกเลิกใบแจ้งหนี้แล้ว');
        this.load();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
