# เอกสาร API (REST)

Base URL: `http://<host>:3000/api`
ทุก endpoint (ยกเว้น login) ต้องส่ง header `Authorization: Bearer <token>`
ระบบรับ token ทาง header เท่านั้น ไม่รับทาง query string (ดาวน์โหลดไฟล์ก็ต้องส่ง header)

token จะใช้ไม่ได้ทันทีเมื่อผู้ใช้เปลี่ยนรหัสผ่าน หรือแอดมินตั้งรหัสผ่านใหม่ให้

## auth

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| POST | `/auth/login` | สาธารณะ | body `{email, password}` → `{token, user}` |
| GET | `/auth/me` | ทุกคน | ข้อมูลผู้ใช้ปัจจุบัน |
| POST | `/auth/change-password` | ทุกคน | `{current_password, new_password}` → `{ok, token}` (token ใหม่ ใช้แทนอันเดิม) |

การล็อกเมื่อล็อกอินผิด: ผิด 5 ครั้งต่ออีเมล หรือ 20 ครั้งต่อ IP ภายใน 15 นาที จะถูกล็อก 15 นาที ตอบ `429 TOO_MANY_ATTEMPTS`
(เก็บในหน่วยความจำ รีสตาร์ทเซิร์ฟเวอร์แล้วล้าง)

## master

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/master/regions` | ทุกคน | ภาค + จำนวนโรงพยาบาล |
| POST | `/master/regions` | ADMIN | เพิ่มภาค `{code, name}` |
| GET | `/master/hospitals?search&region_id&rep_id` | ทุกคน (REP เห็นเฉพาะพื้นที่) | รายการโรงพยาบาล |
| POST | `/master/hospitals` | ADMIN, MANAGER | สร้างโรงพยาบาล |
| PATCH | `/master/hospitals/:id` | ADMIN, MANAGER | แก้ไข |
| GET | `/master/users` | ทุกคน | ADMIN ได้ข้อมูลเต็ม ตำแหน่งอื่นได้แค่ `{id, fullName, role, regionId}` ของผู้ใช้ที่เปิดใช้งาน |
| POST | `/master/users` | ADMIN | สร้างผู้ใช้ |
| PATCH | `/master/users/:id` | ADMIN | แก้ไขผู้ใช้ / ตั้งรหัสผ่านใหม่ |

## contracts

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/contracts?search&region_id&rep_id&hospital_id&status` | ทุกคน (REP เห็นเฉพาะพื้นที่) | รายการสัญญา + สรุปงวด/มูลค่า |
| GET | `/contracts/preview-periods?start&end&cycle&term&mode&amount` | ทุกคน | ดูก่อนว่าจะได้กี่งวด (ไม่บันทึก) |
| GET | `/contracts/:id` | ทุกคน (REP เฉพาะพื้นที่) | รายละเอียด + งวดทั้งหมด + เครื่อง + ยอดสรุป |
| POST | `/contracts` | ADMIN, MANAGER | สร้างสัญญา (สร้างงวดอัตโนมัติ) |
| PATCH | `/contracts/:id?force=true` | ADMIN, MANAGER | แก้ไขสัญญา (ดูหมายเหตุด้านล่าง) |
| POST | `/contracts/:id/renew` | ADMIN, MANAGER | ต่อสัญญาใหม่จากสัญญาเดิม |
| DELETE | `/contracts/:id` | ADMIN | ยกเลิกสัญญา (เปลี่ยนสถานะเป็น CANCELLED ไม่ลบข้อมูล) |

เงื่อนไข

- วันสิ้นสุดต้องไม่ก่อนวันเริ่ม และสัญญายาวได้ไม่เกิน 10 ปี
- วันที่ต้องเป็นวันที่มีอยู่จริง รูปแบบ `YYYY-MM-DD` ระหว่างปี 2000–2100
- จำนวนเงินมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง
- PATCH ที่เปลี่ยนวันเริ่ม วันสิ้นสุด รอบการจ่าย เครดิตเทอม หรือค่าเช่าต่องวด จะสร้างงวดใหม่ทั้งหมด
  ถ้าสัญญามีใบแจ้งหนี้แล้วจะตอบ 409 ต้องส่ง `?force=true` เพื่อยืนยัน
- renew: วันเริ่มของสัญญาใหม่ต้องอยู่หลังวันสิ้นสุดสัญญาเดิม ไม่อย่างนั้นตอบ 400
- DELETE: ตอบ 409 ถ้ายังมีใบแจ้งหนี้ค้างชำระ หรือสัญญาถูกยกเลิกไปแล้ว

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

ค่า `contractType`: `LEASE`, `PURCHASE_ORDER`, `SHORT_TERM`
ค่า `billingCycle`: `MONTHLY`, `EVERY_10_DAYS`, `EVERY_15_DAYS`
ค่า `pricingMode`: `FIXED` (เหมารายงวด), `PAY_PER_USE` (จ่ายตามใช้ ต้องมี `unitPrice`)

## invoices

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/invoices?search&hospital_id&contract_id&region_id&rep_id&state&date_from&date_to` | ทุกคน (REP เห็นเฉพาะพื้นที่) | รายการใบแจ้งหนี้ + สถานะ |
| GET | `/invoices/:id` | ทุกคน (REP เฉพาะพื้นที่) | รายละเอียด + ประวัติส่ง + เช็ค + ไฟล์แนบ |
| POST | `/invoices` | ADMIN, MANAGER, ACCOUNTING | ออกใบแจ้งหนี้ (ดู body ด้านล่าง) |
| POST | `/invoices/bulk` | ADMIN, MANAGER, ACCOUNTING | `{periodIds: [], issueDate, dueDate?}` → `{createdCount, invoices: [{periodId, id, invoiceNo}]}` |
| PATCH | `/invoices/:id` | ADMIN, MANAGER, ACCOUNTING | แก้ `{dueDate?, note?, usageQty?}` |
| POST | `/invoices/:id/cancel` | ADMIN, ACCOUNTING | ยกเลิกใบแจ้งหนี้ |
| POST | `/invoices/:id/deliveries` | ทุกคน (REP เฉพาะพื้นที่) | บันทึกการจัดส่ง |
| DELETE | `/invoices/:invoiceId/deliveries/:deliveryId` | ADMIN, MANAGER | ลบประวัติการจัดส่งที่ไม่ถูกต้อง |

ค่า `state`: `NOT_SENT` (ยังไม่ส่ง), `SENT` (ส่งแล้ว), `PARTIAL` (ชำระบางส่วน), `PAID` (ชำระครบ), `CANCELLED`

body ออกใบแจ้งหนี้

```json
{
  "contractId": "uuid",
  "periodId": "uuid",
  "issueDate": "2026-11-01",
  "dueDate": "2026-12-01",
  "usageQty": 120,
  "note": ""
}
```

- `dueDate` ไม่ส่งก็ได้ ค่าเริ่มต้นคือวันที่ออก + เครดิตเทอมของสัญญา และต้องไม่ก่อนวันที่ออก
- `usageQty` ใช้กับสัญญาจ่ายตามใช้ ระบบคิด `amount = usageQty × unitPrice`
- bulk ออกให้เฉพาะสัญญาแบบเหมารายงวด ข้ามงวดที่มีใบแจ้งหนี้อยู่แล้ว
- PATCH แก้ `usageQty` ได้เฉพาะสัญญาจ่ายตามใช้และยังไม่มีการตัดชำระ ระบบคำนวณยอดและ VAT ใหม่ให้
- ยกเลิกใบที่ยกเลิกไปแล้วตอบ 409

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
ค่า `status`: `IN_TRANSIT`, `DELIVERED`, `ACKNOWLEDGED`, `RETURNED`
ค่า `recipientType`: `REP`, `HOSPITAL`, `OTHER`

## cheques

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/cheques?search&status&hospital_id&rep_id&date_from&date_to&not_at_company=true` | ทุกคน (REP เห็นเฉพาะพื้นที่) | รายการเช็ค |
| GET | `/cheques/:id` | ทุกคน (REP เฉพาะพื้นที่ หรือเช็คที่ตัวเองรับ) | รายละเอียด + รายการตัดชำระ + ไฟล์แนบ |
| POST | `/cheques` | ADMIN, MANAGER, ACCOUNTING, REP | บันทึกเช็ค + ตัดชำระ (REP บันทึกเป็นผู้รับเช็คเองเสมอ) |
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

ค่า `deliveryMethod`: `REP_PICKUP`, `SENT_TO_COMPANY`, `REP_TO_COMPANY`, `HAND_DELIVERED`
ค่า `status` (PATCH): `RECEIVED`, `DEPOSITED`, `CLEARED`, `BOUNCED`, `RETURNED`

การตรวจสอบ: ยอดตัดชำระรวมต้อง ≤ ยอดเช็ค, แต่ละใบต้องเป็นของโรงพยาบาลเดียวกัน และ ≤ ยอดคงค้างของใบนั้น, จำนวนเงินทศนิยมไม่เกิน 2 ตำแหน่ง

## attachments

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| POST | `/attachments` | ทุกคน (REP เฉพาะพื้นที่) | multipart: `entityType` (INVOICE/CHEQUE/CONTRACT/HOSPITAL), `entityId`, `file` |
| GET | `/attachments/:id/download?inline=true` | ทุกคน (REP เฉพาะพื้นที่) | ดาวน์โหลด/เปิดดูไฟล์ |
| DELETE | `/attachments/:id` | ADMIN, MANAGER | ลบไฟล์ |

- ต้องส่งช่อง `entityType` และ `entityId` ก่อนช่อง `file` ในฟอร์ม
- รับเฉพาะ PDF, JPEG, PNG, TIFF, WEBP ขนาด ≤ `MAX_UPLOAD_MB` (ค่าเริ่มต้น 10 MB) เกินขนาดตอบ 413
- ระบบตั้งชื่อไฟล์ที่เก็บเองตามชนิดไฟล์ ไม่ใช้ชื่อหรือนามสกุลที่ส่งมา

## reports

| Method | Path | คำอธิบาย |
| --- | --- | --- |
| GET | `/reports/overview` | KPI ทั้งหมด + aging + byRep + byHospital |
| GET | `/reports/aging` | ยอดค้างแบ่งช่วงอายุหนี้ |
| GET | `/reports/by-rep` | สรุปตามผู้แทน |
| GET | `/reports/by-hospital` | สรุปตามโรงพยาบาล |
| GET | `/reports/uninvoiced-periods?limit` | งวดที่ถึงรอบแล้วยังไม่แจ้งหนี้ |
| GET | `/reports/unpaid-invoices?limit` | ใบแจ้งหนี้ที่ยังไม่ได้รับเช็ค |
| GET | `/reports/delivery-coverage` | ความครบถ้วนของการบันทึกการส่ง |
| GET | `/reports/audit-logs?action&entity_type&search&limit` | บันทึกการใช้งาน (ADMIN, MANAGER) |

- ทุก endpoint ของ reports รับตัวกรอง `region_id`, `rep_id`, `hospital_id`, `contract_id`, `date_from`, `date_to`
- `as_of` (YYYY-MM-DD) คำนวณย้อนหลัง ณ วันนั้น นับเฉพาะใบแจ้งหนี้ที่ออก เช็คที่รับ และการส่งที่เกิดขึ้นภายในวันนั้น ไม่ส่งจะใช้วันนี้ตามเวลาประเทศไทย
- REP เห็นเฉพาะข้อมูลของตัวเองเสมอ ไม่ว่าจะส่งตัวกรองอะไรมา
- `limit` สูงสุด 1000 รายการ

## รูปแบบ error

```json
{ "error": { "message": "รายละเอียดภาษาไทย", "code": "VALIDATION_ERROR", "details": [] } }
```

| HTTP | ความหมาย |
| --- | --- |
| 400 | ข้อมูลรูปแบบผิด เช่น JSON เสีย วันที่ไม่มีจริง ตัวเลขเกินช่วง หรือผิดเงื่อนไขทางธุรกิจ |
| 401 | ไม่ได้เข้าสู่ระบบ / token หมดอายุ / เปลี่ยนรหัสผ่านไปแล้ว |
| 403 | ตำแหน่งนี้ไม่มีสิทธิ์ |
| 404 | ไม่พบข้อมูล หรือเป็นข้อมูลนอกพื้นที่ของผู้แทน |
| 409 | ข้อมูลขัดแย้ง เช่น เลขที่ซ้ำ ออกใบแจ้งหนี้ซ้ำงวดเดิม ยกเลิกซ้ำ (ข้อความภาษาไทย) |
| 413 | ไฟล์ใหญ่เกินกำหนด |
| 422 | ข้อมูลไม่ผ่านการตรวจ (`VALIDATION_ERROR`) — `details` บอกฟิลด์ที่ผิด |
| 429 | ล็อกอินผิดหลายครั้ง ถูกล็อกชั่วคราว |
