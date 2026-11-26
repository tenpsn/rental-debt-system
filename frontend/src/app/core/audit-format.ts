import {
  CHEQUE_DELIVERY_LABEL, CHEQUE_STATUS_LABEL, CONTRACT_STATUS_LABEL, CONTRACT_TYPE_LABEL, DELIVERY_STATUS_LABEL,
  BILLING_CYCLE_LABEL, DELIVERY_METHOD_LABEL, ROLE_LABEL, baht, fileSize, thaiDate,
} from './format';

export interface AuditLine {
  label: string;
  value: string;
  heading?: boolean;
}

// ชื่อประเภทข้อมูลภาษาไทย
export const ENTITY_LABEL: Record<string, string> = {
  INVOICE: 'ใบแจ้งหนี้',
  INVOICE_DELIVERY: 'ประวัติการจัดส่ง',
  CHEQUE: 'เช็ค',
  CONTRACT: 'สัญญา',
  HOSPITAL: 'โรงพยาบาล',
  ATTACHMENT: 'ไฟล์แนบ',
  USER: 'ผู้ใช้',
  AUTH: 'การเข้าสู่ระบบ',
  REGION: 'ภาค',
};

// ชื่อหัวข้อภาษาไทยของแต่ละช่อง
const FIELD_LABEL: Record<string, string> = {
  invoiceNo: 'เลขที่ใบแจ้งหนี้', invoice_no: 'เลขที่ใบแจ้งหนี้',
  contractNo: 'เลขที่สัญญา', contract_no: 'เลขที่สัญญา',
  chequeNo: 'เลขที่เช็ค', cheque_no: 'เลขที่เช็ค',
  bankName: 'ธนาคาร', bankBranch: 'สาขา',
  amount: 'ยอดก่อน VAT', vat: 'VAT', total: 'ยอดรวม', totalAmount: 'ยอดรวมทั้งหมด',
  allocatedTotal: 'ยอดตัดชำระรวม', outstandingBefore: 'ยอดค้างก่อนตัด',
  periodAmount: 'ค่าเช่าต่องวด', unitPrice: 'ราคาต่อหน่วย', unitName: 'หน่วย',
  usageQty: 'จำนวนที่ใช้', periodNo: 'งวดที่', count: 'จำนวน', periods: 'จำนวนงวด',
  issueDate: 'วันที่ออก', dueDate: 'วันครบกำหนด', chequeDate: 'วันที่หน้าเช็ค', receivedDate: 'วันที่รับเช็ค',
  companyReceivedDate: 'วันที่ถึงบริษัท', startDate: 'วันเริ่ม', endDate: 'วันสิ้นสุด',
  delivered_on: 'วันที่ส่ง', deliveredOn: 'วันที่ส่ง',
  method: 'วิธีส่ง', deliveryMethod: 'วิธีนำส่งเช็ค', status: 'สถานะ',
  recipient_type: 'ผู้รับ', recipientType: 'ผู้รับ', recipient_name: 'ชื่อผู้รับ', recipientName: 'ชื่อผู้รับ',
  courier_name: 'บริษัทขนส่ง', courierName: 'บริษัทขนส่ง', tracking_no: 'เลขพัสดุ', trackingNo: 'เลขพัสดุ',
  note: 'หมายเหตุ', title: 'ชื่อสัญญา',
  fileName: 'ชื่อไฟล์', sizeBytes: 'ขนาดไฟล์', size: 'ขนาดไฟล์', entityType: 'แนบกับ',
  contractType: 'ประเภทสัญญา', billingCycle: 'รอบการจ่าย', pricingMode: 'รูปแบบคิดเงิน',
  paymentTermDays: 'เครดิตเทอม (วัน)', vatRate: 'VAT (%)',
  name: 'ชื่อ', code: 'รหัส', province: 'จังหวัด', hospitalType: 'ประเภท',
  contactName: 'ผู้ประสานงาน', contactPhone: 'โทรศัพท์ผู้ประสานงาน', contactEmail: 'อีเมลผู้ประสานงาน', address: 'ที่อยู่',
  fullName: 'ชื่อ', email: 'อีเมล', role: 'ตำแหน่ง', phone: 'โทรศัพท์', isActive: 'สถานะบัญชี',
};

// ช่องที่เป็นรหัสภายในระบบ ไม่ต้องแสดงให้ผู้ใช้เห็น
const HIDDEN = new Set([
  'id', 'invoiceId', 'invoice_id', 'entityId', 'entity_id', 'hospitalId', 'hospital_id', 'contractId', 'contract_id',
  'periodId', 'period_id', 'periodIds', 'recorded_by', 'created_at', 'updated_at', 'uploaded_by', 'receivedBy',
  'password', 'stored_name', 'regionId', 'repId', 'equipment', 'invoices', 'allocations', 'deleted', 'before', 'after',
]);

const MONEY = new Set(['amount', 'vat', 'total', 'totalAmount', 'allocatedTotal', 'outstandingBefore', 'periodAmount', 'unitPrice']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (MONEY.has(key)) return baht(Number(value), 2);
  if (key === 'sizeBytes' || key === 'size') return fileSize(Number(value));
  if (key === 'method') return DELIVERY_METHOD_LABEL[String(value)] ?? String(value);
  if (key === 'deliveryMethod') return CHEQUE_DELIVERY_LABEL[String(value)] ?? String(value);
  if (key === 'recipient_type' || key === 'recipientType') {
    return ({ REP: 'ผู้แทน', HOSPITAL: 'โรงพยาบาล', OTHER: 'อื่น ๆ' } as Record<string, string>)[String(value)] ?? String(value);
  }
  if (key === 'status') {
    const v = String(value);
    return CHEQUE_STATUS_LABEL[v]?.text ?? CONTRACT_STATUS_LABEL[v]?.text ?? DELIVERY_STATUS_LABEL[v]?.text ?? v;
  }
  if (key === 'entityType') return ENTITY_LABEL[String(value)] ?? String(value);
  if (key === 'contractType') return CONTRACT_TYPE_LABEL[String(value)] ?? String(value);
  if (key === 'billingCycle') return BILLING_CYCLE_LABEL[String(value)] ?? String(value);
  if (key === 'pricingMode') return value === 'PAY_PER_USE' ? 'จ่ายตามใช้' : value === 'FIXED' ? 'เหมารายงวด' : String(value);
  if (key === 'role') return ROLE_LABEL[String(value)] ?? String(value);
  if (key === 'isActive') return value ? 'ใช้งาน' : 'ปิดใช้งาน';
  if (typeof value === 'string' && ISO_DATE.test(value.slice(0, 10)) && value.length <= 10) return thaiDate(value);
  if (typeof value === 'object') return '';
  return String(value);
}

// ลำดับการแสดงผล ฐานข้อมูลสลับลำดับช่องเอง จึงเรียงใหม่ให้อ่านง่าย
const ORDER = [
  'invoiceNo', 'invoice_no', 'contractNo', 'contract_no', 'chequeNo', 'cheque_no', 'name', 'fullName', 'code', 'email',
  'fileName', 'entityType', 'sizeBytes',
  'delivered_on', 'deliveredOn', 'issueDate', 'chequeDate', 'receivedDate', 'companyReceivedDate', 'startDate', 'endDate', 'dueDate',
  'contractType', 'billingCycle', 'pricingMode', 'periodAmount', 'unitPrice', 'unitName', 'paymentTermDays', 'vatRate', 'periods',
  'method', 'deliveryMethod', 'recipient_type', 'recipientType', 'recipient_name', 'recipientName',
  'courier_name', 'courierName', 'tracking_no', 'trackingNo',
  'bankName', 'bankBranch', 'amount', 'vat', 'total', 'totalAmount', 'allocatedTotal', 'count',
  'status', 'role', 'isActive', 'note',
];
const rank = (key: string) => {
  const i = ORDER.indexOf(key);
  return i < 0 ? ORDER.length : i;
};

// แปลงข้อมูลแบนหนึ่งชั้นเป็นบรรทัด ข้ามช่องที่ซ่อนและช่องว่าง
function flatLines(data: Record<string, unknown>): AuditLine[] {
  const lines: AuditLine[] = [];
  const entries = Object.entries(data).sort(([a], [b]) => rank(a) - rank(b));
  for (const [key, raw] of entries) {
    if (HIDDEN.has(key)) continue;
    const value = formatValue(key, raw);
    if (!value) continue;
    lines.push({ label: FIELD_LABEL[key] ?? key, value });
  }
  return lines;
}

// แปลงรายละเอียดของบันทึกการใช้งานหนึ่งรายการ เป็นบรรทัดภาษาไทยที่อ่านง่าย
export function describeAudit(payload: unknown): AuditLine[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  const lines = flatLines(data);

  // ข้อมูลที่ถูกลบ
  if (data['deleted'] && typeof data['deleted'] === 'object') {
    lines.push({ label: 'ข้อมูลที่ถูกลบ', value: '', heading: true }, ...flatLines(data['deleted'] as Record<string, unknown>));
  }

  // เปลี่ยนจากค่าเดิมเป็นค่าใหม่
  if (data['after'] && typeof data['after'] === 'object') {
    const before = (data['before'] ?? {}) as Record<string, unknown>;
    for (const [key, next] of Object.entries(data['after'] as Record<string, unknown>)) {
      if (HIDDEN.has(key)) continue;
      const nextText = formatValue(key, next);
      const prevText = formatValue(key, before[key]);
      if (!nextText && !prevText) continue;
      lines.push({ label: FIELD_LABEL[key] ?? key, value: prevText && prevText !== nextText ? `${prevText} → ${nextText || '—'}` : nextText });
    }
  }

  // รายการใบแจ้งหนี้ที่ออกพร้อมกันหลายใบ
  if (Array.isArray(data['invoices'])) {
    lines.push({ label: 'ใบแจ้งหนี้ที่ออก', value: '', heading: true });
    for (const inv of data['invoices'] as Record<string, unknown>[]) {
      const where = [inv['contractNo'], inv['periodNo'] ? `งวด ${inv['periodNo']}` : ''].filter(Boolean).join(' ');
      lines.push({ label: String(inv['invoiceNo'] ?? '—'), value: `${baht(Number(inv['total'] ?? 0), 2)}${where ? ` (${where})` : ''}` });
    }
  }

  // รายการตัดชำระของเช็ค
  if (Array.isArray(data['allocations'])) {
    lines.push({ label: 'ตัดชำระ', value: '', heading: true });
    for (const a of data['allocations'] as Record<string, unknown>[]) {
      lines.push({ label: String(a['invoiceNo'] ?? '—'), value: baht(Number(a['amount'] ?? 0), 2) });
    }
  }
  return lines;
}
