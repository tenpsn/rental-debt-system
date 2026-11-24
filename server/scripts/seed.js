/**
 * ข้อมูลตัวอย่างสำหรับเดโม/ทดสอบ
 * - 5 ภาค, 5 ผู้แทน, 13 โรงพยาบาล, 15 สัญญา (เหมารายงวด + จ่ายตามใช้ + ใบสั่งจ้าง)
 * - ใบแจ้งหนี้ + ประวัติการจัดส่ง + เช็ค + ไฟล์ PDF ตัวอย่าง
 *
 * วิธีใช้: npm run seed   (ล้างข้อมูลเดิมทั้งหมด)
 */
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pool, db } from '../src/db.js';
import { config } from '../src/config.js';
import { regeneratePeriods } from '../src/services/periods.js';
import { simplePdf } from './pdf.js';

const today = new Date();
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const TODAY = iso(today);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);

// deterministic random
let seed = 20261120;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

const PROFILE = {
  good: { paid: 0.82, pending: 0.1 },
  slow: { paid: 0.5, pending: 0.15 },
  problem: { paid: 0.28, pending: 0.1 },
};

const REGIONS = [
  { code: 'NE', name: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: 'N', name: 'ภาคเหนือ' },
  { code: 'C', name: 'ภาคกลาง' },
  { code: 'S', name: 'ภาคใต้' },
  { code: 'E', name: 'ภาคตะวันออก' },
];

const REPS = [
  { email: 'somchai@medrental.co.th', name: 'สมชาย วัฒนกิจ', region: 'NE', phone: '081-234-5671' },
  { email: 'siriporn@medrental.co.th', name: 'ศิริพร อินทร์แก้ว', region: 'N', phone: '081-234-5672' },
  { email: 'anan@medrental.co.th', name: 'อนันต์ ชัยมงคล', region: 'C', phone: '081-234-5673' },
  { email: 'malee@medrental.co.th', name: 'มาลี ศรีสุข', region: 'S', phone: '081-234-5674' },
  { email: 'preecha@medrental.co.th', name: 'ปรีชา ทองดี', region: 'E', phone: '081-234-5675' },
];

const HOSPITALS = [
  { code: 'KK-SRIN', name: 'โรงพยาบาลศรีนครินทร์', type: 'รพ.มหาวิทยาลัย', province: 'ขอนแก่น', region: 'NE', profile: 'good' },
  { code: 'KORAT-RM', name: 'โรงพยาบาลมหาราชนครราชสีมา', type: 'รพ.ศูนย์', province: 'นครราชสีมา', region: 'NE', profile: 'slow' },
  { code: 'KK-KHON', name: 'โรงพยาบาลขอนแก่น', type: 'รพ.ศูนย์', province: 'ขอนแก่น', region: 'NE', profile: 'problem' },
  { code: 'LP-LAMP', name: 'โรงพยาบาลลำปาง', type: 'รพ.ศูนย์', province: 'ลำปาง', region: 'N', profile: 'slow' },
  { code: 'CR-PRA', name: 'โรงพยาบาลเชียงรายประชานุเคราะห์', type: 'รพ.ศูนย์', province: 'เชียงราย', region: 'N', profile: 'good' },
  { code: 'CM-NAKP', name: 'โรงพยาบาลนครพิงค์', type: 'รพ.ทั่วไป', province: 'เชียงใหม่', region: 'N', profile: 'good' },
  { code: 'BKK-RAJ', name: 'โรงพยาบาลราชวิถี', type: 'รพ.ศูนย์', province: 'กรุงเทพมหานคร', region: 'C', profile: 'slow' },
  { code: 'NBI-PNK', name: 'โรงพยาบาลพระนั่งเกล้า', type: 'รพ.ทั่วไป', province: 'นนทบุรี', region: 'C', profile: 'good' },
  { code: 'SPB-HOSP', name: 'โรงพยาบาลสุพรรณบุรี', type: 'รพ.ทั่วไป', province: 'สุพรรณบุรี', region: 'C', profile: 'problem' },
  { code: 'HY-HADY', name: 'โรงพยาบาลหาดใหญ่', type: 'รพ.ศูนย์', province: 'สงขลา', region: 'S', profile: 'slow' },
  { code: 'SRT-HOSP', name: 'โรงพยาบาลสุราษฎร์ธานี', type: 'รพ.ทั่วไป', province: 'สุราษฎร์ธานี', region: 'S', profile: 'good' },
  { code: 'TRG-HOSP', name: 'โรงพยาบาลตรัง', type: 'รพ.ทั่วไป', province: 'ตรัง', region: 'S', profile: 'problem' },
  { code: 'CBI-CANCER', name: 'โรงพยาบาลมะเร็งชลบุรี', type: 'รพ.เฉพาะทาง', province: 'ชลบุรี', region: 'E', profile: 'slow' },
  { code: 'RYG-HOSP', name: 'โรงพยาบาลระยอง', type: 'รพ.ทั่วไป', province: 'ระยอง', region: 'E', profile: 'good' },
];

const CONTRACTS = [
  { no: 'CT-2569-001', hospital: 'KK-SRIN', type: 'LEASE', start: '2026-10-01', end: '2027-09-30', mode: 'FIXED', amount: 30000, equipment: [{ name: 'เครื่องเอกซเรย์คอมพิวเตอร์ (CT)', model: 'Somatom go.UP', serial: 'CT-88213', qty: 1 }] },
  { no: 'CT-2569-014', hospital: 'KK-SRIN', type: 'LEASE', start: '2026-01-01', end: '2026-12-31', mode: 'PAY_PER_USE', unit: 70, unitName: 'ภาพ', equipment: [{ name: 'เครื่องเอกซเรย์ดิจิทัล (DR)', model: 'Ysio Max', serial: 'DR-11029', qty: 1 }] },
  { no: 'CT-2568-007', hospital: 'KORAT-RM', type: 'LEASE', start: '2025-10-01', end: '2026-09-30', mode: 'FIXED', amount: 45000, equipment: [{ name: 'เครื่อง CT 64 slice', model: 'Revolution EVO', serial: 'CT-40122', qty: 1 }] },
  { no: 'CT-2569-021', hospital: 'KORAT-RM', type: 'LEASE', start: '2026-10-01', end: '2027-09-30', mode: 'FIXED', amount: 45000, renewOf: 'CT-2568-007' },
  { no: 'PO-2569-003', hospital: 'KK-KHON', type: 'PURCHASE_ORDER', start: '2026-10-01', end: '2026-12-31', mode: 'FIXED', amount: 18000, equipment: [{ name: 'เครื่องอัลตราซาวด์', model: 'Affiniti 50', serial: 'US-77341', qty: 1 }] },
  { no: 'CT-2568-011', hospital: 'LP-LAMP', type: 'LEASE', start: '2025-10-01', end: '2026-09-30', mode: 'FIXED', amount: 25000, equipment: [{ name: 'เครื่อง DR ห้องเอกซเรย์', model: 'DigitalDiagnost C50', serial: 'DR-55210', qty: 1 }] },
  { no: 'CT-2569-030', hospital: 'LP-LAMP', type: 'LEASE', start: '2026-10-01', end: '2027-09-30', mode: 'FIXED', amount: 25000, renewOf: 'CT-2568-011' },
  { no: 'CT-2569-005', hospital: 'CR-PRA', type: 'LEASE', start: '2026-04-01', end: '2027-03-31', mode: 'PAY_PER_USE', unit: 55, unitName: 'ครั้ง', equipment: [{ name: 'เครื่อง Mammography', model: 'Mammomat Revelation', serial: 'MG-30118', qty: 1 }] },
  { no: 'CT-2569-009', hospital: 'CM-NAKP', type: 'LEASE', start: '2026-07-01', end: '2027-06-30', mode: 'FIXED', amount: 38000, equipment: [{ name: 'เครื่อง CT 128 slice', model: 'Incisive CT', serial: 'CT-66420', qty: 1 }] },
  { no: 'CT-2567-002', hospital: 'BKK-RAJ', type: 'LEASE', start: '2025-01-01', end: '2027-12-31', mode: 'FIXED', amount: 52000, equipment: [{ name: 'ระบบ PACS + เครื่อง DR', model: 'IntelliSpace', serial: 'PACS-90012', qty: 1 }] },
  { no: 'CT-2569-012', hospital: 'NBI-PNK', type: 'LEASE', start: '2026-10-01', end: '2027-09-30', mode: 'FIXED', amount: 22000, equipment: [{ name: 'เครื่องอัลตราซาวด์', model: 'EPIQ Elite', serial: 'US-88210', qty: 1 }] },
  { no: 'CT-2569-017', hospital: 'SPB-HOSP', type: 'LEASE', start: '2026-03-01', end: '2027-02-28', mode: 'PAY_PER_USE', unit: 70, unitName: 'ภาพ', equipment: [{ name: 'เครื่อง DR เคลื่อนที่', model: 'MobileDiagnost wDR', serial: 'DR-22190', qty: 2 }] },
  { no: 'CT-2568-004', hospital: 'HY-HADY', type: 'LEASE', start: '2026-01-01', end: '2026-12-31', mode: 'FIXED', amount: 41000, equipment: [{ name: 'เครื่อง CT 64 slice', model: 'Aquilion Prime', serial: 'CT-71345', qty: 1 }] },
  { no: 'CT-2569-008', hospital: 'SRT-HOSP', type: 'LEASE', start: '2026-10-01', end: '2027-09-30', mode: 'FIXED', amount: 33000, equipment: [{ name: 'เครื่อง DR ห้องเอกซเรย์', model: 'DigitalDiagnost C90', serial: 'DR-90233', qty: 1 }] },
  { no: 'PO-2569-011', hospital: 'TRG-HOSP', type: 'SHORT_TERM', start: '2026-09-01', end: '2026-11-30', mode: 'FIXED', amount: 15000, equipment: [{ name: 'เครื่องอัลตราซาวด์', model: 'Affiniti 30', serial: 'US-11223', qty: 1 }] },
  { no: 'CT-2569-015', hospital: 'CBI-CANCER', type: 'LEASE', start: '2026-06-01', end: '2027-05-31', mode: 'FIXED', amount: 28000, equipment: [{ name: 'เครื่อง CT Simulation', model: 'Somatom go.Sim', serial: 'CT-31009', qty: 1 }] },
  { no: 'CT-2568-019', hospital: 'RYG-HOSP', type: 'LEASE', start: '2026-02-01', end: '2027-01-31', mode: 'PAY_PER_USE', unit: 65, unitName: 'ภาพ', equipment: [{ name: 'เครื่อง DR', model: 'Ysio Max', serial: 'DR-44551', qty: 1 }] },
];

const DELIVERY_METHODS = ['COURIER_TO_REP', 'COURIER_TO_HOSPITAL', 'HAND_TO_REP', 'HAND_TO_HOSPITAL'];
const COURIERS = ['Kerry Express', 'Flash Express', 'ไปรษณีย์ไทย', 'J&T Express'];
const BANKS = ['ธนาคารกรุงไทย', 'ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงเทพ', 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร'];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      TRUNCATE cheque_allocations, cheques, invoice_deliveries, attachments, invoices,
               contract_periods, equipment, contracts, hospitals, audit_logs, users, regions
      RESTART IDENTITY CASCADE`);
    await client.query("ALTER SEQUENCE invoice_no_seq RESTART WITH 1");

    // ---------- regions ----------
    const regionIds = {};
    for (const r of REGIONS) {
      const { rows } = await client.query('INSERT INTO regions (code, name) VALUES ($1,$2) RETURNING id', [r.code, r.name]);
      regionIds[r.code] = rows[0].id;
    }

    // ---------- users ----------
    const demoHash = await bcrypt.hash('ChangeMe123!', 10);
    const adminHash = await bcrypt.hash('Admin123!', 10);

    const admin = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,'ADMIN') RETURNING id`,
      ['admin@medrental.co.th', adminHash, 'ผู้ดูแลระบบ'],
    );
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,'MANAGER')`,
      ['manager@medrental.co.th', demoHash, 'ผู้จัดการฝ่ายขาย'],
    );
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,'ACCOUNTING')`,
      ['accounting@medrental.co.th', demoHash, 'ฝ่ายบัญชี'],
    );

    const repIds = {};
    for (const rep of REPS) {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, region_id, phone)
         VALUES ($1,$2,$3,'REP',$4,$5) RETURNING id`,
        [rep.email, demoHash, rep.name, regionIds[rep.region], rep.phone],
      );
      repIds[rep.region] = rows[0].id;
    }

    // ---------- hospitals ----------
    const hospitalIds = {};
    for (const h of HOSPITALS) {
      const { rows } = await client.query(
        `INSERT INTO hospitals (code, name, hospital_type, province, region_id, rep_id, address, contact_name, contact_phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          h.code, h.name, h.type, h.province, regionIds[h.region], repIds[h.region],
          `${h.province}, ประเทศไทย`, 'งานการเงินและบัญชี', '0' + Math.floor(20000000 + rnd() * 9999999),
        ],
      );
      hospitalIds[h.code] = rows[0].id;
    }

    // ---------- contracts + periods ----------
    const contractByNo = {};
    for (const c of CONTRACTS) {
      const { rows } = await client.query(
        `INSERT INTO contracts (contract_no, hospital_id, contract_type, title, start_date, end_date,
                                billing_cycle, pricing_mode, period_amount, unit_price, unit_name,
                                payment_term_days, vat_rate, status, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'MONTHLY',$7,$8,$9,$10,30,7,'ACTIVE',$11,$12) RETURNING *`,
        [
          c.no, hospitalIds[c.hospital], c.type, `สัญญาเช่าเครื่อง ${HOSPITALS.find((h) => h.code === c.hospital).name}`,
          c.start, c.end, c.mode, c.amount ?? null, c.unit ?? null, c.unitName ?? null,
          c.type === 'PURCHASE_ORDER' ? 'ใบสั่งจ้างระหว่างรอทำสัญญา' : null,
          admin.rows[0].id,
        ],
      );
      const contract = rows[0];
      contractByNo[c.no] = contract;
      await regeneratePeriods(client, contract);
      for (const e of c.equipment || []) {
        await client.query(
          `INSERT INTO equipment (contract_id, name, model, serial_no, qty) VALUES ($1,$2,$3,$4,$5)`,
          [contract.id, e.name, e.model, e.serial, e.qty],
        );
      }
    }

    // ---------- invoices / deliveries / cheques ----------
    const pdfDir = path.join(config.uploadDir, 'invoice');
    fs.mkdirSync(pdfDir, { recursive: true });

    let deliveredSeq = 0;
    for (const c of CONTRACTS) {
      const contract = contractByNo[c.no];
      const hospital = HOSPITALS.find((h) => h.code === c.hospital);
      const profile = PROFILE[hospital.profile];

      const { rows: periods } = await client.query(
        `SELECT * FROM contract_periods WHERE contract_id = $1 ORDER BY period_no`,
        [contract.id],
      );

      const openInvoices = [];
      // สัญญาธงชัย: ตรงตามตัวอย่างในโจทย์ (ต.ค. 2569 - ก.ย. 2570, 30,000/งวด, แจ้งหนี้แล้ว 1 งวด)
      const flagship = c.no === 'CT-2569-001';

      for (const p of periods) {
        if (p.period_start > TODAY) continue;
        if (flagship && p.period_no !== 1) continue;
        // งวดล่าสุดของบางสัญญายังไม่แจ้งหนี้
        const isLatest = p.period_end >= TODAY || periods[periods.length - 1].id === p.id;
        if (!flagship && isLatest && chance(0.45)) continue;
        if (!flagship && chance(0.06)) continue; // หลุดการแจ้งหนี้เป็นครั้งคราว

        const issueDate = flagship
          ? '2026-10-05'
          : iso(new Date(Math.min(new Date(addDays(p.period_start, 2)).getTime(), today.getTime())));
        const amount =
          contract.pricing_mode === 'PAY_PER_USE'
            ? Math.round((80 + Math.floor(rnd() * 70)) * Number(contract.unit_price))
            : Number(contract.period_amount);
        const vat = Math.round(amount * 0.07 * 100) / 100;
        const total = amount + vat;
        const dueDate = iso(addDays(issueDate, 30));

        const seq = await client.query("SELECT nextval('invoice_no_seq') AS n");
        const invoiceNo = `INV-${issueDate.slice(0, 7).replace('-', '')}-${String(seq.rows[0].n).padStart(4, '0')}`;

        const { rows: invRows } = await client.query(
          `INSERT INTO invoices (invoice_no, hospital_id, contract_id, period_id, issue_date, due_date,
                                 amount, vat_amount, total_amount, usage_qty, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ISSUED',$11) RETURNING *`,
          [
            invoiceNo, hospitalIds[hospital.code], contract.id, p.id, issueDate, dueDate,
            amount, vat, total,
            contract.pricing_mode === 'PAY_PER_USE' ? Math.round(amount / Number(contract.unit_price)) : null,
            admin.rows[0].id,
          ],
        );
        const invoice = invRows[0];

        // --- delivery ---
        const ageDays = Math.round((today - new Date(issueDate)) / 86400000);
        if (flagship) {
          await client.query(
            `INSERT INTO invoice_deliveries (invoice_id, delivered_on, method, status, recipient_type,
                                            recipient_name, courier_name, tracking_no, recorded_by)
             VALUES ($1,'2026-10-06','COURIER_TO_REP','ACKNOWLEDGED','REP',$2,'Kerry Express','TH760012345',$3)`,
            [invoice.id, 'สมชาย วัฒนกิจ', admin.rows[0].id],
          );
        } else if (ageDays > 2 && chance(0.92)) {
          deliveredSeq += 1;
          const method = pick(DELIVERY_METHODS);
          const toRep = method.includes('REP');
          const deliveredOn = iso(new Date(Math.min(addDays(issueDate, 1 + Math.floor(rnd() * 4)).getTime(), today.getTime())));
          await client.query(
            `INSERT INTO invoice_deliveries (invoice_id, delivered_on, method, status, recipient_type,
                                            recipient_name, courier_name, tracking_no, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              invoice.id, deliveredOn, method,
              ageDays > 5 ? 'DELIVERED' : chance(0.5) ? 'IN_TRANSIT' : 'DELIVERED',
              toRep ? 'REP' : 'HOSPITAL',
              toRep ? REPS.find((r) => r.region === hospital.region).name : 'งานการเงินและบัญชี',
              method.startsWith('COURIER') ? pick(COURIERS) : null,
              method.startsWith('COURIER') ? `TH${String(760000000 + deliveredSeq * 137).slice(0, 9)}` : null,
              admin.rows[0].id,
            ],
          );
        }

        // --- attachment PDF ---
        if (chance(0.6)) {
          const stored = `${crypto.randomUUID()}.pdf`;
          const buf = simplePdf(
            [
              `Invoice No : ${invoiceNo}`,
              `Hospital   : ${hospital.code}`,
              `Issue Date : ${issueDate}`,
              `Due Date   : ${dueDate}`,
              `Amount     : ${amount.toFixed(2)} THB`,
              `VAT 7%     : ${vat.toFixed(2)} THB`,
              `Total      : ${total.toFixed(2)} THB`,
              '',
              'Demo document generated by seed script.',
            ],
            'RENTAL INVOICE',
          );
          fs.writeFileSync(path.join(pdfDir, stored), buf);
          await client.query(
            `INSERT INTO attachments (entity_type, entity_id, file_name, stored_name, mime_type, size_bytes, uploaded_by)
             VALUES ('INVOICE',$1,$2,$3,'application/pdf',$4,$5)`,
            [invoice.id, `${invoiceNo}.pdf`, `invoice/${stored}`, buf.length, admin.rows[0].id],
          );
        }

        // --- payment behavior ---
        if (flagship) {
          const { rows: chRows } = await client.query(
            `INSERT INTO cheques (cheque_no, bank_name, bank_branch, amount, cheque_date, received_date,
                                  received_by, hospital_id, delivery_method, company_received_date, status, note)
             VALUES ('2045118','ธนาคารกรุงไทย','ขอนแก่น',$1,'2026-11-10','2026-11-05',$2,$3,'REP_TO_COMPANY','2026-11-07','CLEARED','ผู้แทนรับเช็คที่โรงพยาบาล')
             RETURNING id`,
            [total, repIds[hospital.region], hospitalIds[hospital.code]],
          );
          await client.query(
            `INSERT INTO cheque_allocations (cheque_id, invoice_id, amount) VALUES ($1,$2,$3)`,
            [chRows[0].id, invoice.id, total],
          );
          continue;
        }
        const roll = rnd();
        if (roll < profile.paid) {
          const receivedDate = iso(addDays(dueDate, 5 + Math.floor(rnd() * 35)));
          if (receivedDate <= TODAY) {
            const { rows: chRows } = await client.query(
              `INSERT INTO cheques (cheque_no, bank_name, bank_branch, amount, cheque_date, received_date,
                                    received_by, hospital_id, delivery_method, company_received_date, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
              [
                `${String(1000000 + Math.floor(rnd() * 8999999))}`,
                pick(BANKS), `${hospital.province}`,
                total, iso(addDays(receivedDate, 3)), receivedDate,
                repIds[hospital.region], hospitalIds[hospital.code],
                pick(['REP_PICKUP', 'SENT_TO_COMPANY', 'REP_TO_COMPANY']),
                chance(0.9) ? iso(addDays(receivedDate, 2 + Math.floor(rnd() * 6))) : null,
                chance(0.85) ? 'CLEARED' : 'DEPOSITED',
              ],
            );
            await client.query(
              `INSERT INTO cheque_allocations (cheque_id, invoice_id, amount) VALUES ($1,$2,$3)`,
              [chRows[0].id, invoice.id, total],
            );
          }
        } else if (roll < profile.paid + profile.pending) {
          openInvoices.push(invoice);
        } else {
          openInvoices.push(invoice);
        }
      }

      // เช็คที่รับแล้วแต่ยังไม่ส่งถึงบริษัท / รอเคลียร์リング
      if (openInvoices.length && chance(0.4)) {
        const inv = openInvoices[0];
        const receivedDate = iso(new Date(today.getTime() - Math.floor(rnd() * 6) * 86400000));
        const { rows: chRows } = await client.query(
          `INSERT INTO cheques (cheque_no, bank_name, bank_branch, amount, cheque_date, received_date,
                                received_by, hospital_id, delivery_method, company_received_date, status, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'REP_PICKUP',$9,'RECEIVED',$10) RETURNING id`,
          [
            `${String(1000000 + Math.floor(rnd() * 8999999))}`,
            pick(BANKS), hospital.province, inv.total_amount,
            iso(addDays(receivedDate, 5)), receivedDate,
            repIds[hospital.region], hospitalIds[hospital.code],
            chance(0.3) ? null : iso(addDays(receivedDate, 1)),
            'ผู้แทนรับเช็คแล้ว รอส่งเข้าบริษัท',
          ],
        );
        await client.query(
          `INSERT INTO cheque_allocations (cheque_id, invoice_id, amount) VALUES ($1,$2,$3)`,
          [chRows[0].id, inv.id, inv.total_amount],
        );
      }
    }

    // ---------- audit log ตัวอย่าง ----------
    await client.query(
      `INSERT INTO audit_logs (actor_email, action, entity_type, entity_id, payload)
       VALUES ($1,'SEED','SYSTEM','-',$2)`,
      ['admin@medrental.co.th', JSON.stringify({ note: 'demo data', seededAt: new Date().toISOString() })],
    );

    await client.query('COMMIT');

    const counts = await db.query(`
      SELECT (SELECT count(*) FROM hospitals)::int AS hospitals,
             (SELECT count(*) FROM contracts)::int AS contracts,
             (SELECT count(*) FROM invoices)::int AS invoices,
             (SELECT count(*) FROM cheques)::int AS cheques,
             (SELECT count(*) FROM contract_periods)::int AS periods`);
    console.log('seed complete:', counts.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
