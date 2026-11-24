# ระบบบันทึกและติดตามหนี้จากการเช่าเครื่อง (Rental Debt Tracking)

ระบบสำหรับบริษัทที่ให้เช่าเครื่องมือแพทย์แก่โรงพยาบาลรัฐ ใช้บันทึก**สัญญา/ใบสั่งจ้าง**, **งวดการเรียกเก็บ**, **ใบแจ้งหนี้**, **การจัดส่งเอกสาร** และ**เช็คที่รับชำระ** พร้อมรายงานสรุปภาพรวม รายผู้แทน รายโรงพยาบาล อายุหนี้ และรายการที่ยังไม่ได้ดำเนินการ

## ความสามารถหลัก

| กลุ่มงาน | รายละเอียด |
| --- | --- |
| สัญญา | สัญญาเช่า / ใบสั่งจ้าง / สัญญาระยะสั้น, เหมารายงวด (fixed rate) หรือจ่ายตามใช้ (pay per use), รอบจ่ายรายเดือน หรือทุก 10/15 วัน, สร้างงวดอัตโนมัติ, ต่อสัญญา |
| ใบแจ้งหนี้ | ออกใบแจ้งหนี้รายงวด หรือออกย้อนหลังหลายงวดพร้อมกัน, เลขรันอัตโนมัติ `INV-YYYYMM-NNNN`, ยกเลิกใบแจ้งหนี้ |
| การติดตามส่งเอกสาร | บันทึกทุกครั้งที่ส่ง (วิธีส่ง, ขนส่ง, เลขพัสดุ, ผู้รับ) ดูย้อนหลังได้ว่าไปเมื่อไร อย่างไร ถึงใคร |
| เช็ค | บันทึกเช็คพร้อมตัดชำระหลายใบแจ้งหนี้, ระบุวิธีนำส่ง (ผู้แทนเข้าไปรับ / รพ. ส่งมา / ผู้แทนนำส่งบริษัท), ติดตามสถานะ รับเช็ค → นำฝาก → เงินเข้า / เด้ง |
| ไฟล์แนบ | แนบ PDF ใบแจ้งหนี้ และไฟล์ scan เช็ค (PDF/รูปภาพ ≤ 10 MB) |
| รายงาน | ภาพรวม KPI, แยกตามผู้แทน, แยกตามโรงพยาบาล, อายุหนี้ 30/60/90/90+, ความครบถ้วนของการส่ง, งวดที่ยังไม่แจ้งหนี้, ใบแจ้งหนี้ที่ยังไม่ได้รับเช็ค, ส่งออก CSV |
| ผู้ใช้ | 4 บทบาท: ผู้ดูแลระบบ, ผู้จัดการ, ฝ่ายบัญชี, ผู้แทนพื้นที่ (เห็นเฉพาะพื้นที่ตัวเอง) |
| ตรวจสอบย้อนหลัง | ทุกการสร้าง/แก้ไข/อัปโหลด ถูกบันทึกใน `audit_logs` และไฟล์ log |

## เทคโนโลยี

- **PostgreSQL 14+** — ตาราง, view `v_invoice_receivable`, trigger `updated_at`
- **Node.js 18+ / Express 4** — REST API, JWT, Zod validation, Multer upload, Pino log
- **Angular 20** — standalone components, signals, Thai Buddhist-era date formatting

## เริ่มใช้งานเร็ว (โหมดทดลอง ไม่ต้องติดตั้ง PostgreSQL เอง)

```bash
cd server
npm install
npm run dev:embedded     # ดาวน์โหลด PostgreSQL ฝังตัว + สร้าง schema + start API ที่ :3000
npm run seed             # (terminal ที่สอง) ใส่ข้อมูลตัวอย่าง
```

```bash
cd web
npm install
npm start                # http://localhost:4200 (proxy /api → localhost:3000)
```

เข้าสู่ระบบ: `admin@medrental.co.th` / `Admin123!`

> รายละเอียดการติดตั้งแบบ production (PostgreSQL จริง, Nginx, systemd) อยู่ใน `docs/01-คู่มือการติดตั้ง.md`
> รายละเอียดการใช้งานทุกหน้าจออยู่ใน `docs/02-คู่มือการใช้งาน.md`

## โครงสร้างโปรเจกต์

```
rental-debt-system/
├── db/schema.sql            # schema ทั้งหมด (idempotent — รันซ้ำได้)
├── server/
│   ├── src/                 # API (config, routes, services, middleware)
│   ├── scripts/             # migrate, seed, dev:embedded, สร้าง PDF ตัวอย่าง
│   ├── tests/               # 32 tests (unit + integration บน embedded PostgreSQL)
│   └── logs/, uploads/      # เกิดตอนรัน (ไม่ commit)
└── web/src/app/
    ├── core/                # models, api service, auth, interceptor, format
    ├── layout/              # shell (sidebar + topbar)
    └── pages/               # 13 หน้า: dashboard, contracts, invoices, cheques, ...
```

## การทดสอบ

```bash
cd server && npm test      # 32/32 ผ่าน (สตาร์ท embedded PostgreSQL พอร์ต 55440 อัตโนมัติ)
```

## เอกสาร

- [คู่มือการติดตั้ง](docs/01-คู่มือการติดตั้ง.md)
- [คู่มือการใช้งาน](docs/02-คู่มือการใช้งาน.md)
- [เอกสาร API](docs/03-API.md)
