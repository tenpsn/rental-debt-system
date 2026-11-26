import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuditLog } from '../core/models';
import { ACTION_LABEL, ACTION_TONE, thaiDateTime } from '../core/format';
import { AuditLine, ENTITY_LABEL, describeAudit } from '../core/audit-format';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h1>บันทึกการใช้งาน</h1>
        <p>ทุกการสร้าง/แก้ไข/อัปโหลดไฟล์ในระบบจะถูกบันทึกเพื่อการตรวจสอบย้อนหลัง</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-body">
        <div class="filters">
          <div class="field">
            <label>การกระทำ</label>
            <select [(ngModel)]="action" (ngModelChange)="load()">
              <option value="">ทั้งหมด</option>
              @for (a of actions; track a) { <option [value]="a">{{ actionLabel(a) }}</option> }
            </select>
          </div>
          <div class="field">
            <label>ประเภทข้อมูล</label>
            <select [(ngModel)]="entityType" (ngModelChange)="load()">
              <option value="">ทั้งหมด</option>
              @for (t of entityTypes; track t) { <option [value]="t">{{ entityLabel(t) }}</option> }
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>ข้อมูล</th><th>IP</th><th>รายละเอียด</th></tr></thead>
          <tbody>
            @for (log of logs(); track log.id) {
              <tr>
                <td class="small" style="white-space:nowrap">{{ thaiDateTime(log.createdAt) }}</td>
                <td class="small">{{ log.actorEmail || '—' }}</td>
                <td><span [class]="'chip ' + actionTone(log.action)">{{ actionLabel(log.action) }}</span></td>
                <td class="small">{{ entityLabel(log.entityType) }}</td>
                <td class="small muted">{{ log.ipAddress || '—' }}</td>
                <td class="small audit-detail">
                  <div class="audit-lines">
                    @for (line of describe(log); track $index) {
                      @if (line.heading) {
                        <div class="audit-heading">{{ line.label }}</div>
                      } @else {
                        <div><span class="muted">{{ line.label }}:</span> {{ line.value }}</div>
                      }
                    } @empty {
                      <span class="muted">—</span>
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty">ไม่พบบันทึก</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AuditComponent {
  private api = inject(ApiService);

  readonly logs = signal<AuditLog[]>([]);
  action = '';
  entityType = '';

  readonly actions = ['LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'UPLOAD', 'BULK_CREATE', 'RENEW', 'CHANGE_PASSWORD'];
  readonly entityTypes = ['INVOICE', 'INVOICE_DELIVERY', 'CHEQUE', 'CONTRACT', 'HOSPITAL', 'ATTACHMENT', 'USER', 'AUTH'];

  readonly thaiDateTime = thaiDateTime;
  readonly actionLabel = (a: string) => ACTION_LABEL[a] ?? a;
  readonly actionTone = (a: string) => ACTION_TONE[a] ?? '';

  constructor() {
    this.load();
  }

  load() {
    this.api.auditLogs({ action: this.action, entity_type: this.entityType, limit: 200 }).subscribe((rows) => this.logs.set(rows));
  }

  readonly entityLabel = (t: string) => ENTITY_LABEL[t] ?? t;

  // แปลงรายละเอียดเป็นบรรทัดภาษาไทย เก็บผลไว้ จะได้ไม่คำนวณใหม่ทุกครั้งที่หน้าจอวาด
  private readonly described = new WeakMap<AuditLog, AuditLine[]>();
  describe(log: AuditLog): AuditLine[] {
    let lines = this.described.get(log);
    if (!lines) {
      lines = describeAudit(log.payload);
      this.described.set(log, lines);
    }
    return lines;
  }
}
