/**
 * Integration tests: รันกับ PostgreSQL จริง (embedded-postgres)
 * ครอบคลุม: auth/RBAC, สัญญา+งวด, ใบแจ้งหนี้+VAT, การจัดส่ง, เช็ค+ตัดชำระ,
 *           ไฟล์แนบ, audit log และตัวเลขรายงาน (aging / uninvoiced / collection)
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PG_PORT = 55440;
const TEST_DIR = `/tmp/rds-test-${process.pid}`;
const UPLOAD_DIR = `${TEST_DIR}-uploads`;

let pgServer;
let pool;
let db;
let app;
let token;       // admin
let repToken;    // ผู้แทนภาคเหนือ
let rep2Token;   // ผู้แทนภาคใต้
let accountingToken;

const iso = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);
const monthStart = (offset) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
};

const ids = {};

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

const api = (method, url, t = token) => request(app)[method](url).set('authorization', `Bearer ${t}`);

before(async () => {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });

  pgServer = new EmbeddedPostgres({
    databaseDir: TEST_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PG_PORT,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C.utf8'],
  });
  await pgServer.initialise();
  await pgServer.start();
  await pgServer.createDatabase('rental_test');

  process.env.DB_PORT = String(PG_PORT);
  process.env.DB_NAME = 'rental_test';
  process.env.DB_USER = 'postgres';
  process.env.DB_PASSWORD = 'postgres';
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = UPLOAD_DIR;
  process.env.LOG_DIR = `${TEST_DIR}-logs`;
  process.env.JWT_SECRET = 'test-secret';

  const dbmod = await import('../src/db.js');
  pool = dbmod.pool;
  db = dbmod.createDb(pool);

  await pool.query(fs.readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8'));

  const { createApp } = await import('../src/app.js');
  app = createApp(db);

  // ---- fixtures ----
  const region = await pool.query(`INSERT INTO regions (code,name) VALUES ('N','ภาคเหนือ') RETURNING id`);
  ids.regionN = region.rows[0].id;
  const region2 = await pool.query(`INSERT INTO regions (code,name) VALUES ('S','ภาคใต้') RETURNING id`);
  ids.regionS = region2.rows[0].id;

  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash('Test1234!', 4);
  const mkUser = async (email, name, role, regionId) => {
    const r = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, region_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [email, hash, name, role, regionId],
    );
    return r.rows[0].id;
  };
  ids.admin = await mkUser('admin@test.local', 'ผู้ดูแลระบบ', 'ADMIN', null);
  ids.repN = await mkUser('rep.north@test.local', 'ผู้แทนเหนือ', 'REP', ids.regionN);
  ids.repS = await mkUser('rep.south@test.local', 'ผู้แทนใต้', 'REP', ids.regionS);
  ids.accounting = await mkUser('acc@test.local', 'ฝ่ายบัญชี', 'ACCOUNTING', null);

  const h1 = await pool.query(
    `INSERT INTO hospitals (code, name, province, region_id, rep_id) VALUES ('H1','โรงพยาบาลทดสอบหนึ่ง','เชียงใหม่',$1,$2) RETURNING id`,
    [ids.regionN, ids.repN],
  );
  ids.h1 = h1.rows[0].id;
  const h2 = await pool.query(
    `INSERT INTO hospitals (code, name, province, region_id, rep_id) VALUES ('H2','โรงพยาบาลทดสอบสอง','สงขลา',$1,$2) RETURNING id`,
    [ids.regionS, ids.repS],
  );
  ids.h2 = h2.rows[0].id;

  token = await login('admin@test.local', 'Test1234!');
  repToken = await login('rep.north@test.local', 'Test1234!');
  rep2Token = await login('rep.south@test.local', 'Test1234!');
  accountingToken = await login('acc@test.local', 'Test1234!');
});

after(async () => {
  if (pool) await pool.end();
  if (pgServer) await pgServer.stop();
});

describe('Authentication & สิทธิ์การใช้งาน', () => {
  it('ปฏิเสธรหัสผ่านผิด', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrong' });
    assert.equal(res.status, 401);
  });

  it('ปฏิเสธการเรียก API โดยไม่แนบ token', async () => {
    const res = await request(app).get('/api/reports/overview');
    assert.equal(res.status, 401);
  });

  it('ผู้แทนสร้างสัญญาไม่ได้ (403)', async () => {
    const res = await api('post', '/api/contracts', repToken).send({
      contractNo: 'X-1', hospitalId: ids.h1, startDate: '2026-01-01', endDate: '2026-12-31', periodAmount: 1000,
    });
    assert.equal(res.status, 403);
  });
});

describe('สัญญาและงวดการเรียกเก็บ', () => {
  it('สร้างสัญญา 1 ปี แล้วได้ 12 งวด', async () => {
    const res = await api('post', '/api/contracts').send({
      contractNo: 'CT-TEST-001',
      hospitalId: ids.h1,
      contractType: 'LEASE',
      startDate: '2026-10-01',
      endDate: '2027-09-30',
      billingCycle: 'MONTHLY',
      pricingMode: 'FIXED',
      periodAmount: 30000,
      paymentTermDays: 30,
      equipment: [{ name: 'เครื่อง CT', model: 'X', qty: 1 }],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.periodCount, 12);
    ids.contract = res.body.id;

    const detail = await api('get', `/api/contracts/${ids.contract}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.periods.length, 12);
    assert.equal(detail.body.periods[0].dueDate, '2026-11-30');
    assert.equal(detail.body.equipment.length, 1);
  });

  it('ดูก่อนว่าจะได้กี่งวด (preview-periods) ตามรอบจ่ายและเครดิตเทอม', async () => {
    const res = await api('get', '/api/contracts/preview-periods')
      .query({ start: '2026-10-01', end: '2027-09-30', cycle: 'MONTHLY', term: 30, mode: 'FIXED', amount: 30000 });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 12);
    assert.equal(res.body.periods[0].due_date, '2026-11-30');

    const q10 = await api('get', '/api/contracts/preview-periods')
      .query({ start: '2026-01-01', end: '2026-01-31', cycle: 'EVERY_10_DAYS', term: 15 });
    assert.equal(q10.status, 200);
    assert.equal(q10.body.count, 4); // 1-10, 11-20, 21-30, 31
  });

  it('สัญญาแบบจ่ายตามใช้ต้องระบุราคาต่อหน่วย', async () => {
    const res = await api('post', '/api/contracts').send({
      contractNo: 'CT-TEST-PPU', hospitalId: ids.h2, startDate: '2026-01-01', endDate: '2026-12-31',
      pricingMode: 'PAY_PER_USE',
    });
    assert.equal(res.status, 400);
  });

  it('สร้างสัญญา pay per use สำเร็จ และงวดไม่มียอดคงที่', async () => {
    const res = await api('post', '/api/contracts').send({
      contractNo: 'CT-TEST-PPU-2', hospitalId: ids.h2, startDate: '2026-01-01', endDate: '2026-12-31',
      pricingMode: 'PAY_PER_USE', unitPrice: 70, unitName: 'ภาพ',
    });
    assert.equal(res.status, 201);
    ids.contractPpu = res.body.id;
    const detail = await api('get', `/api/contracts/${ids.contractPpu}`);
    assert.equal(detail.body.periods.length, 12);
    assert.equal(detail.body.periods[0].expectedAmount, null);
  });
});

describe('ใบแจ้งหนี้', () => {
  it('ออกใบแจ้งหนี้แล้วคำนวณ VAT 7% และวันครบกำหนดถูกต้อง', async () => {
    const detail = await api('get', `/api/contracts/${ids.contract}`);
    const period = detail.body.periods[0];

    const res = await api('post', '/api/invoices', accountingToken).send({
      contractId: ids.contract,
      periodId: period.id,
      issueDate: '2026-10-05',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.totalAmount, 32100);

    ids.invoice = res.body.id;
    const inv = await api('get', `/api/invoices/${ids.invoice}`);
    assert.equal(inv.body.amount, 30000);
    assert.equal(inv.body.vatAmount, 2100);
    assert.equal(inv.body.dueDate, '2026-11-04');
    assert.equal(inv.body.paymentState, 'NOT_SENT');
    assert.equal(inv.body.repName, 'ผู้แทนเหนือ'); // ชื่อผู้แทนพื้นที่ติดมากับใบแจ้งหนี้
  });

  it('ออกใบแจ้งหนี้ซ้ำในงวดเดิมไม่ได้ (409)', async () => {
    const detail = await api('get', `/api/contracts/${ids.contract}`);
    const res = await api('post', '/api/invoices', accountingToken).send({
      contractId: ids.contract,
      periodId: detail.body.periods[0].id,
      issueDate: '2026-10-06',
    });
    assert.equal(res.status, 409);
  });

  it('pay per use คำนวณจากจำนวนหน่วย x ราคาต่อหน่วย', async () => {
    const detail = await api('get', `/api/contracts/${ids.contractPpu}`);
    const res = await api('post', '/api/invoices', accountingToken).send({
      contractId: ids.contractPpu,
      periodId: detail.body.periods[0].id,
      issueDate: '2026-01-05',
      usageQty: 100,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.totalAmount, 7490); // 7,000 + VAT 490
  });

  it('บันทึกการจัดส่งใบแจ้งหนี้ และดูประวัติย้อนหลังได้', async () => {
    const res = await api('post', `/api/invoices/${ids.invoice}/deliveries`, repToken).send({
      deliveredOn: '2026-10-06',
      method: 'COURIER_TO_REP',
      recipientType: 'REP',
      recipientName: 'ผู้แทนเหนือ',
      courierName: 'Kerry Express',
      trackingNo: 'TH123456789',
      status: 'DELIVERED',
    });
    assert.equal(res.status, 201);

    const inv = await api('get', `/api/invoices/${ids.invoice}`);
    assert.equal(inv.body.deliveries.length, 1);
    assert.equal(inv.body.deliveries[0].trackingNo, 'TH123456789');
    assert.equal(inv.body.paymentState, 'SENT');
  });

  it('แนบไฟล์ PDF ใบแจ้งหนี้ และเปิดไฟล์ได้', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const res = await api('post', '/api/attachments')
      .field('entityType', 'INVOICE')
      .field('entityId', ids.invoice)
      .attach('file', pdf, { filename: 'invoice.pdf', contentType: 'application/pdf' });
    assert.equal(res.status, 201);

    const inv = await api('get', `/api/invoices/${ids.invoice}`);
    assert.equal(inv.body.attachments.length, 1);
    assert.equal(inv.body.attachments[0].fileName, 'invoice.pdf');

    const file = await request(app).get(`/api/attachments/${res.body.id}/download?token=${token}`);
    assert.equal(file.status, 200);
    assert.match(file.headers['content-type'], /application\/pdf/);
  });

  it('ปฏิเสธไฟล์ที่ไม่ใช่ PDF/รูปภาพ', async () => {
    const res = await api('post', '/api/attachments')
      .field('entityType', 'INVOICE')
      .field('entityId', ids.invoice)
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });
    assert.equal(res.status, 400);
  });

  it('ยกเลิกใบแจ้งหนี้ที่ยังไม่มีการตัดชำระได้', async () => {
    const detail = await api('get', `/api/contracts/${ids.contractPpu}`);
    const created = await api('post', '/api/invoices', accountingToken).send({
      contractId: ids.contractPpu,
      periodId: detail.body.periods[1].id,
      issueDate: '2026-02-05',
      usageQty: 50,
    });
    const cancel = await api('post', `/api/invoices/${created.body.id}/cancel`, accountingToken);
    assert.equal(cancel.status, 200);
  });
});

describe('เช็คและการตัดชำระ', () => {
  it('บันทึกเช็คพร้อมตัดชำระใบแจ้งหนี้', async () => {
    const res = await api('post', '/api/cheques', repToken).send({
      chequeNo: '9988776',
      bankName: 'ธนาคารกรุงไทย',
      amount: 32100,
      chequeDate: '2026-11-10',
      receivedDate: '2026-11-05',
      hospitalId: ids.h1,
      deliveryMethod: 'REP_PICKUP',
      companyReceivedDate: '2026-11-07',
      allocations: [{ invoiceId: ids.invoice, amount: 32100 }],
    });
    assert.equal(res.status, 201);
    ids.cheque = res.body.id;

    const inv = await api('get', `/api/invoices/${ids.invoice}`);
    assert.equal(inv.body.paymentState, 'PAID');
    assert.equal(inv.body.outstandingAmount, 0);
    assert.equal(inv.body.cheques.length, 1);
  });

  it('ตัดชำระเกินยอดค้างไม่ได้', async () => {
    const res = await api('post', '/api/cheques', repToken).send({
      chequeNo: '1111111',
      bankName: 'ธนาคารกสิกรไทย',
      amount: 1000,
      chequeDate: '2026-11-10',
      receivedDate: '2026-11-05',
      hospitalId: ids.h1,
      allocations: [{ invoiceId: ids.invoice, amount: 1000 }],
    });
    assert.equal(res.status, 400);
  });

  it('ผู้แทนรับเช็คของโรงพยาบาลพื้นที่อื่นไม่ได้ (403)', async () => {
    const res = await api('post', '/api/cheques', repToken).send({
      chequeNo: '2222222',
      bankName: 'ธนาคารไทยพาณิชย์',
      amount: 1000,
      chequeDate: '2026-11-10',
      receivedDate: '2026-11-05',
      hospitalId: ids.h2,
      allocations: [],
    });
    assert.equal(res.status, 403);
  });

  it('เปลี่ยนสถานะเช็คเป็น CLEARED ได้', async () => {
    const res = await api('patch', `/api/cheques/${ids.cheque}`).send({ status: 'CLEARED' });
    assert.equal(res.status, 200);
    const c = await api('get', `/api/cheques/${ids.cheque}`);
    assert.equal(c.body.status, 'CLEARED');
    assert.equal(c.body.allocations.length, 1);
  });
});

describe('รายงานและสรุปภาพรวม', () => {
  it('สรุปภาพรวมคำนวณยอดค้าง/รับเช็ค/เปอร์เซ็นต์ถูกต้อง', async () => {
    const res = await api('get', '/api/reports/overview');
    assert.equal(res.status, 200);
    const { kpi } = res.body;

    // ใบแจ้งหนี้ที่ยังใช้งานอยู่: CT-TEST-001 (32,100) + PPU (7,490)
    assert.equal(kpi.invoiceCount, 2);
    assert.equal(kpi.invoiceAmount, 39590);
    assert.equal(kpi.chequeAmount, 32100);
    assert.equal(kpi.collectionRate, 81.08);
    assert.ok(kpi.awaitingCount >= 1);
  });

  it('สรุปตามสัญญา: งวดที่ยังไม่แจ้งหนี้ 11/12 และมูลค่าคงเหลือ 330,000 (ตามตัวอย่างในโจทย์)', async () => {
    const res = await api('get', `/api/reports/overview?contract_id=${ids.contract}`);
    assert.equal(res.status, 200);
    const { kpi } = res.body;
    assert.equal(kpi.totalPeriods, 12);
    assert.equal(kpi.invoicedPeriods, 1);
    assert.equal(kpi.notInvoicedPeriods, 11);
    assert.equal(kpi.remainingValue, 330000);
    // ณ วันที่ทดสอบ งวดที่เริ่มแล้วแต่ยังไม่แจ้งหนี้ = 1 งวด (พ.ย.)
    assert.equal(kpi.dueNotInvoicedPeriods, 1);
  });

  it('รายการงวดที่เริ่มแล้วแต่ยังไม่แจ้งหนี้ พร้อมจำนวนวันที่เลยกำหนด', async () => {
    const res = await api('get', `/api/reports/uninvoiced-periods?contract_id=${ids.contract}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].periodNo, 2);
    assert.equal(res.body[0].estimatedAmount, 30000);
    assert.equal(res.body[0].repName, 'ผู้แทนเหนือ');
  });

  it('มูลค่าคงเหลือในสัญญา = จำนวนงวดที่ยังไม่แจ้งหนี้ x ค่าเช่า/งวด', async () => {
    const detail = await api('get', `/api/contracts/${ids.contract}`);
    const uninvoiced = detail.body.periods.filter((p) => !p.invoiceId).length;
    const res = await api('get', `/api/reports/by-hospital?hospital_id=${ids.h1}`);
    const row = res.body.find((r) => r.id === ids.h1);
    assert.equal(row.remainingValue, uninvoiced * 30000);
    assert.equal(row.dueNotInvoicedPeriods, 1);
  });

  it('aging จัดกลุ่มอายุหนี้ตามวันครบกำหนด', async () => {
    const today = new Date();
    const dueDate = iso(addDays(today, -45));
    const issueDate = iso(addDays(today, -75));

    const detail = await api('get', `/api/contracts/${ids.contract}`);
    const period = detail.body.periods[3];
    const created = await api('post', '/api/invoices', accountingToken).send({
      contractId: ids.contract,
      periodId: period.id,
      issueDate,
      dueDate,
    });
    assert.equal(created.status, 201);

    const aging = await api('get', '/api/reports/aging');
    const bucket = aging.body.find((b) => b.bucket === 'D31_60');
    assert.ok(bucket.count >= 1);
    assert.equal(bucket.amount, 32100);
  });

  it('ผู้แทนเห็นข้อมูลเฉพาะพื้นที่ของตัวเอง', async () => {
    const res = await api('get', '/api/reports/overview', repToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.kpi.invoiceCount, 2);
    assert.ok(res.body.byHospital.every((h) => h.id === ids.h1));

    const other = await api('get', '/api/reports/overview', rep2Token);
    assert.equal(other.body.kpi.invoiceCount, 1);
  });

  it('ความครบถ้วนการส่งใบแจ้งหนี้แยกตามสัญญา', async () => {
    const res = await api('get', '/api/reports/delivery-coverage');
    const row = res.body.find((r) => r.contractId === ids.contract);
    assert.equal(row.invoiceCount, 2);
    assert.equal(row.deliveredCount, 1);
    assert.equal(row.undeliveredCount, 1);
  });
});

describe('Audit log', () => {
  it('บันทึกทุกการเปลี่ยนแปลงข้อมูล', async () => {
    const { rows } = await pool.query(
      `SELECT action, entity_type, actor_email FROM audit_logs WHERE entity_type = 'CONTRACT' AND action = 'CREATE'`,
    );
    assert.ok(rows.length >= 2);
    assert.equal(rows[0].actor_email, 'admin@test.local');

    const res = await api('get', '/api/reports/audit-logs?entity_type=INVOICE');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 3);
    assert.ok(res.body[0].createdAt);
  });

  it('ผู้แทนเข้าดู audit log ไม่ได้', async () => {
    const res = await api('get', '/api/reports/audit-logs', repToken);
    assert.equal(res.status, 403);
  });
});
