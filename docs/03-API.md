# เอกสาร API (REST)

Base URL: `http://<host>:3000/api`
ทุก endpoint (ยกเว้น login) ต้องส่ง header `Authorization: Bearer <token>`
ไฟล์ดาวน์โหลด (GET) ส่ง token ทาง query ได้: `?token=<token>`

## auth

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| POST | `/auth/login` | สาธารณะ | body `{email, password}` → `{token, user}` |
| GET | `/auth/me` | ทุกคน | ข้อมูลผู้ใช้ปัจจุบัน |
| POST | `/auth/change-password` | ทุกคน | `{current_password, new_password}` |

## master

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/master/regions` | ทุกคน | ภาค + จำนวนโรงพยาบาล |
| GET | `/master/hospitals?search&region_id&rep_id` | ทุกคน (REP เห็นเฉพาะพื้นที่) | รายการโรงพยาบาล |
| POST | `/master/hospitals` | ADMIN, MANAGER | สร้างโรงพยาบาล |
| PATCH | `/master/hospitals/:id` | ADMIN, MANAGER | แก้ไข |
| GET | `/master/users` | ทุกคน | รายชื่อผู้ใช้ (สำหรับ dropdown) |
| POST | `/master/users` | ADMIN | สร้างผู้ใช้ |
| PATCH | `/master/users/:id` | ADMIN | แก้ไขผู้ใช้ / ตั้งรหัสผ่านใหม่ |

## contracts

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/contracts?search&region_id&rep_id&status` | ทุกคน | รายการสัญญา + สรุปงวด/มูลค่า |
| GET | `/contracts/preview-periods?start&end&cycle&term&mode&amount` | ทุกคน | ดูก่อนว่าจะได้กี่งวด (ไม่บันทึก) |
| GET | `/contracts/:id` | ทุกคน | รายละเอียด + งวดทั้งหมด + เครื่อง |
| POST | `/contracts` | ADMIN, MANAGER | สร้างสัญญา (สร้างงวดอัตโนมัติ) |
| PATCH | `/contracts/:id` | ADMIN, MANAGER | แก้ไขสัญญา (แก้ช่วงวันจะสร้างงวดใหม่) |
| POST | `/contracts/:id/renew` | ADMIN, MANAGER | ต่อสัญญาใหม่จากสัญญาเดิม |

ตัวอย่าง body สร้างสัญญา

```json
{
  "contractNo": "CT-2569-018",
  "hospitalId": "uuid",
  "contractType": "LEASE",
  "startDate": "2026-10-01",
  "endDate": "2027-09-30",
  "billingCycle": "MONTHLY",
  "pricingMode": "FIXED",
  "periodAmount": 30000,
  "paymentTermDays": 30,
  "vatRate": 7,
  "equipment": [{ "name": "Digital X-Ray", "model": "XR-200", "serialNo": "SN001", "qty": 1 }]
}
```

## invoices

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/invoices?search&hospital_id&rep_id&payment_state&date_from&date_to` | ทุกคน | รายการใบแจ้งหนี้ + สถานะ |
| GET | `/invoices/:id` | ทุกคน | รายละเอียด + ประวัติส่ง + เช็ค + ไฟล์แนบ |
| POST | `/invoices` | ADMIN, MANAGER, ACCOUNTING | ออกใบแจ้งหนี้จากงวด: `{contractId, periodId, issueDate, usageQty?}` |
| POST | `/invoices/bulk` | ADMIN, MANAGER, ACCOUNTING | `{periodIds: [], issueDate}` → `{createdCount}` |
| POST | `/invoices/:id/cancel` | ADMIN, MANAGER, ACCOUNTING | ยกเลิกใบแจ้งหนี้ |
| POST | `/invoices/:id/deliveries` | ทุกคน | บันทึกการจัดส่ง |
| DELETE | `/invoices/:invoiceId/deliveries/:deliveryId` | ADMIN, MANAGER, ACCOUNTING | ลบบันทึกส่งที่ไม่ถูกต้อง |

body บันทึกการจัดส่ง

```json
{
  "deliveredOn": "2026-11-20",
  "method": "COURIER_TO_REP",
  "status": "DELIVERED",
  "recipientType": "REP",
  "recipientName": "สมชาย วัฒนกิจ",
  "courierName": "Kerry Express",
  "trackingNo": "TH760012330",
  "note": "ฝากผู้แทนนำส่ง รพ."
}
```

ค่า `method`: `COURIER_TO_REP`, `COURIER_TO_HOSPITAL`, `HAND_TO_REP`, `HAND_TO_HOSPITAL`, `EMAIL`, `POST`

## cheques

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/cheques?status&hospital_id&rep_id&date_from&date_to` | ทุกคน (REP เห็นเฉพาะพื้นที่) | รายการเช็ค |
| GET | `/cheques/:id` | ทุกคน | รายละเอียด + รายการตัดชำระ + ไฟล์แนบ |
| POST | `/cheques` | ADMIN, MANAGER, ACCOUNTING, REP | บันทึกเช็ค + ตัดชำระ |
| PATCH | `/cheques/:id` | ADMIN, MANAGER, ACCOUNTING | แก้สถานะ / วันที่ถึงบริษัท / หมายเหตุ |

body บันทึกเช็ค

```json
{
  "chequeNo": "2045118",
  "bankName": "ธนาคารกรุงไทย",
  "bankBranch": "สาขาบางรัก",
  "amount": 32100,
  "chequeDate": "2026-11-30",
  "receivedDate": "2026-11-20",
  "hospitalId": "uuid",
  "deliveryMethod": "REP_PICKUP",
  "companyReceivedDate": "2026-11-22",
  "allocations": [{ "invoiceId": "uuid", "amount": 32100 }]
}
```

การตรวจสอบ: ยอดตัดชำระรวมต้อง ≤ ยอดเช็ค, แต่ละใบต้องเป็นของโรงพยาบาลเดียวกัน และ ≤ ยอดคงค้างของใบนั้น

## attachments

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| POST | `/attachments` | ทุกคน | multipart: `entityType` (INVOICE/CHEQUE/CONTRACT/HOSPITAL), `entityId`, `file` |
| GET | `/attachments/:id/download?inline=true` | ทุกคน | ดาวน์โหลด/เปิดดูไฟล์ |
| DELETE | `/attachments/:id` | ADMIN, MANAGER, ACCOUNTING | ลบไฟล์ |

รับเฉพาะ PDF, JPEG, PNG, TIFF, WEBP ขนาด ≤ `MAX_UPLOAD_MB` (ค่าเริ่มต้น 10 MB)

## reports

| Method | Path | คำอธิบาย |
| --- | --- | --- |
| GET | `/reports/overview?as_of&region_id&rep_id` | KPI ทั้งหมด + aging + byRep + byHospital |
| GET | `/reports/aging` | ยอดค้างแบ่งช่วงอายุหนี้ |
| GET | `/reports/by-rep` | สรุปตามผู้แทน |
| GET | `/reports/by-hospital` | สรุปตามโรงพยาบาล |
| GET | `/reports/uninvoiced-periods?limit` | งวดที่ถึงรอบแล้วยังไม่แจ้งหนี้ |
| GET | `/reports/unpaid-invoices?limit` | ใบแจ้งหนี้ที่ยังไม่ได้รับเช็ค |
| GET | `/reports/delivery-coverage` | ความครบถ้วนของการบันทึกการส่ง |
| GET | `/reports/audit-logs?action&entity_type&limit` | บันทึกการใช้งาน (ADMIN, MANAGER) |

ทุก endpoint ของ reports รับ `as_of` (YYYY-MM-DD) เพื่อคำนวณย้อนหลัง ณ วันใดวันหนึ่ง

## รูปแบบ error

```json
{ "error": { "message": "รายละเอียดภาษาไทย", "code": "BAD_REQUEST", "details": [] } }
```

| HTTP | ความหมาย |
| --- | --- |
| 400 | ข้อมูลไม่ถูกต้อง (Zod) — `details` บอกฟิลด์ที่ผิด |
| 401 | ไม่ได้เข้าสู่ระบบ / token หมดอายุ |
| 403 | ไม่มีสิทธิ์ หรือเข้าถึงข้อมูลนอกพื้นที่ |
| 404 | ไม่พบข้อมูล |
| 409 | ข้อมูลขัดแย้ง เช่น ออกใบแจ้งหนี้ซ้ำงวดเดิม |
