const TODAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// วันที่วันนี้ตามเวลาประเทศไทย ไม่ใช้ toISOString เพราะนั่นเป็นเวลา UTC
// ช่วงเที่ยงคืนถึงเจ็ดโมงเช้าจะได้วันที่ของเมื่อวาน
export function todayIso(): string {
  return TODAY_FORMATTER.format(new Date());
}

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

/** 20 พ.ย. 2569 */
export function thaiDate(value?: string | null, long = false): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.getDate();
  const month = long ? THAI_MONTHS_LONG[d.getMonth()] : THAI_MONTHS_SHORT[d.getMonth()];
  return `${day} ${month} ${d.getFullYear() + 543}`;
}

/** 20/11/2569 */
export function thaiDateShort(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
}

export function thaiDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${thaiDateShort(d.toISOString())} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function money(value?: number | null, decimals = 0): string {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function baht(value?: number | null, decimals = 0): string {
  return `฿${money(value, decimals)}`;
}

export function percent(value?: number | null, decimals = 1): string {
  if (value === null || value === undefined) return '0%';
  return `${new Intl.NumberFormat('th-TH', { maximumFractionDigits: decimals }).format(value)}%`;
}

export function compactBaht(value?: number | null): string {
  const v = value ?? 0;
  if (Math.abs(v) >= 1_000_000) return `฿${(v / 1_000_000).toFixed(2)} ล้าน`;
  if (Math.abs(v) >= 1_000) return `฿${money(v)}`;
  return `฿${money(v)}`;
}

export const PAYMENT_STATE_LABEL: Record<string, { text: string; tone: string }> = {
  NOT_SENT: { text: 'ยังไม่ส่ง', tone: 'amber' },
  SENT: { text: 'ส่งแล้ว รอเช็ค', tone: 'blue' },
  PARTIAL: { text: 'รับเช็คบางส่วน', tone: 'violet' },
  PAID: { text: 'รับเช็คครบ', tone: 'green' },
  CANCELLED: { text: 'ยกเลิก', tone: '' },
};

export const CONTRACT_STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  DRAFT: { text: 'ร่าง', tone: '' },
  ACTIVE: { text: 'ใช้งาน', tone: 'green' },
  COMPLETED: { text: 'สิ้นสุดแล้ว', tone: 'blue' },
  CANCELLED: { text: 'ยกเลิก', tone: 'red' },
};

export const CHEQUE_STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  RECEIVED: { text: 'รับเช็คแล้ว', tone: 'blue' },
  DEPOSITED: { text: 'นำฝากแล้ว', tone: 'violet' },
  CLEARED: { text: 'เงินเข้าแล้ว', tone: 'green' },
  BOUNCED: { text: 'เช็คเด้ง', tone: 'red' },
  RETURNED: { text: 'คืนเช็ค', tone: 'red' },
};

export const DELIVERY_METHOD_LABEL: Record<string, string> = {
  COURIER_TO_REP: 'ขนส่ง → ผู้แทนพื้นที่',
  COURIER_TO_HOSPITAL: 'ขนส่ง → โรงพยาบาล',
  HAND_TO_REP: 'ผู้แทนรับที่บริษัท',
  HAND_TO_HOSPITAL: 'พนักงานนำส่งโรงพยาบาล',
  EMAIL: 'อีเมล',
  POST: 'ไปรษณีย์',
};

export const CHEQUE_DELIVERY_LABEL: Record<string, string> = {
  REP_PICKUP: 'ผู้แทนเข้าไปรับที่ รพ.',
  SENT_TO_COMPANY: 'รพ. ส่งมาที่บริษัท',
  REP_TO_COMPANY: 'ผู้แทนนำเข้าบริษัท',
  HAND_DELIVERED: 'นำส่งด้วยตนเอง',
};

export const CONTRACT_TYPE_LABEL: Record<string, string> = {
  LEASE: 'สัญญาเช่า',
  PURCHASE_ORDER: 'ใบสั่งจ้าง',
  SHORT_TERM: 'สัญญาระยะสั้น',
};

// สีของประเภทสัญญา ใช้แยกประเภทให้เห็นเร็วขึ้น
export const CONTRACT_TYPE_TONE: Record<string, string> = {
  LEASE: 'blue',
  PURCHASE_ORDER: 'violet',
  SHORT_TERM: 'amber',
};

// สถานะการจัดส่งใบแจ้งหนี้
export const DELIVERY_STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  IN_TRANSIT: { text: 'ระหว่างขนส่ง', tone: 'amber' },
  DELIVERED: { text: 'ส่งถึงแล้ว', tone: 'green' },
  ACKNOWLEDGED: { text: 'ผู้รับตอบรับ', tone: 'blue' },
  RETURNED: { text: 'ตีกลับ', tone: 'red' },
};

export const BILLING_CYCLE_LABEL: Record<string, string> = {
  MONTHLY: 'รายเดือน',
  EVERY_10_DAYS: 'ทุก 10 วัน',
  EVERY_15_DAYS: 'ทุก 15 วัน',
};

export const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'เข้าสู่ระบบ',
  CREATE: 'สร้าง',
  UPDATE: 'แก้ไข',
  DELETE: 'ลบ',
  CANCEL: 'ยกเลิก',
  UPLOAD: 'อัปโหลดไฟล์',
  BULK_CREATE: 'ออกใบแจ้งหนี้หลายใบ',
  RENEW: 'ต่อสัญญา',
  CHANGE_PASSWORD: 'เปลี่ยนรหัสผ่าน',
  SEED: 'ข้อมูลตัวอย่าง',
};

// สีของแต่ละการกระทำ เขียวคือเพิ่ม เหลืองคือแก้ แดงคือลบหรือยกเลิก
export const ACTION_TONE: Record<string, string> = {
  LOGIN: 'blue',
  CREATE: 'green',
  BULK_CREATE: 'green',
  RENEW: 'green',
  UPDATE: 'amber',
  CHANGE_PASSWORD: 'amber',
  DELETE: 'red',
  CANCEL: 'red',
  UPLOAD: 'violet',
};

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  MANAGER: 'ผู้จัดการ',
  ACCOUNTING: 'ฝ่ายบัญชี',
  REP: 'ผู้แทนพื้นที่',
};

// สีของแต่ละตำแหน่ง
export const ROLE_TONE: Record<string, string> = {
  ADMIN: 'blue',
  MANAGER: 'violet',
  ACCOUNTING: 'amber',
  REP: 'green',
};

// ป้ายสั้นบนไอคอนไฟล์ ตามชนิดไฟล์จริง
export function fileIcon(mimeType?: string | null): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType?.startsWith('image/')) return 'IMG';
  return 'FILE';
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
