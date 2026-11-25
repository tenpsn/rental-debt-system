import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { authorize } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
const round2 = (v) => Math.round(Number(v) * 100) / 100;

const createSchema = z.object({
  contractId: z.string().uuid(),
  periodId: z.string().uuid().optional().nullable(),
  invoiceNo: z.string().optional().nullable(),
  issueDate: dateStr,
  dueDate: dateStr.optional().nullable(),
  amount: z.number().nonnegative().optional().nullable(),
  usageQty: z.number().nonnegative().optional().nullable(),
  note: z.string().optional().nullable(),
});

const deliverySchema = z.object({
  deliveredOn: dateStr,
  method: z.enum(['COURIER_TO_REP', 'COURIER_TO_HOSPITAL', 'HAND_TO_REP', 'HAND_TO_HOSPITAL', 'EMAIL', 'POST']),
  status: z.enum(['IN_TRANSIT', 'DELIVERED', 'ACKNOWLEDGED', 'RETURNED']).default('DELIVERED'),
  recipientType: z.enum(['REP', 'HOSPITAL', 'OTHER']).default('REP'),
  recipientName: z.string().optional().nullable(),
  courierName: z.string().optional().nullable(),
  trackingNo: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

const mapInvoice = (v) => ({
  id: v.id,
  invoiceNo: v.invoice_no,
  hospitalId: v.hospital_id,
  hospitalName: v.hospital_name,
  hospitalCode: v.hospital_code,
  contractId: v.contract_id,
  contractNo: v.contract_no,
  periodId: v.period_id,
  periodNo: v.period_no,
  periodStart: v.period_start,
  periodEnd: v.period_end,
  issueDate: v.issue_date,
  dueDate: v.due_date,
  amount: v.amount,
  vatAmount: v.vat_amount,
  totalAmount: v.total_amount,
  usageQty: v.usage_qty,
  pricingMode: v.pricing_mode,
  status: v.status,
  paymentState: v.payment_state,
  outstandingAmount: v.outstanding_amount,
  chequeReceivedAmount: v.cheque_received_amount,
  daysOverdue: Number(v.days_overdue || 0),
  lastDeliveredOn: v.last_delivered_on,
  deliveryCount: Number(v.delivery_count || 0),
  attachmentCount: Number(v.attachment_count || 0),
  repId: v.rep_id,
  repName: v.rep_name,
  note: v.note,
});

async function nextInvoiceNo(client, issueDate) {
  const { rows } = await client.query("SELECT nextval('invoice_no_seq') AS n");
  const ym = String(issueDate).slice(0, 7).replace('-', '');
  return `INV-${ym}-${String(rows[0].n).padStart(4, '0')}`;
}

export default function invoiceRoutes(db) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const params = [];
      const where = ["v.status <> 'CANCELLED'"];
      if (req.user.role === 'REP') {
        params.push(req.user.id);
        where.push(`h.rep_id = $${params.length}`);
      } else if (req.query.rep_id) {
        params.push(req.query.rep_id);
        where.push(`h.rep_id = $${params.length}`);
      }
      if (req.query.hospital_id) {
        params.push(req.query.hospital_id);
        where.push(`v.hospital_id = $${params.length}`);
      }
      if (req.query.contract_id) {
        params.push(req.query.contract_id);
        where.push(`v.contract_id = $${params.length}`);
      }
      if (req.query.region_id) {
        params.push(Number(req.query.region_id));
        where.push(`h.region_id = $${params.length}`);
      }
      if (req.query.state) {
        params.push(req.query.state);
        where.push(`v.payment_state = $${params.length}`);
      }
      if (req.query.search) {
        params.push(`%${req.query.search}%`);
        where.push(`(v.invoice_no ILIKE $${params.length} OR h.name ILIKE $${params.length})`);
      }
      if (req.query.date_from) {
        params.push(req.query.date_from);
        where.push(`v.issue_date >= $${params.length}`);
      }
      if (req.query.date_to) {
        params.push(req.query.date_to);
        where.push(`v.issue_date <= $${params.length}`);
      }

      const { rows } = await db.query(
        `SELECT v.* FROM v_invoice_receivable v
           JOIN hospitals h ON h.id = v.hospital_id
          WHERE ${where.join(' AND ')}
          ORDER BY v.issue_date DESC, v.invoice_no DESC
          LIMIT 1000`,
        params,
      );
      res.json(rows.map(mapInvoice));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query('SELECT * FROM v_invoice_receivable WHERE id = $1', [req.params.id]);
      const inv = rows[0];
      if (!inv) throw ApiError.notFound('ไม่พบใบแจ้งหนี้');

      const [deliveries, cheques, attachments] = await Promise.all([
        db.query(
          `SELECT d.*, u.full_name AS recorded_by_name
             FROM invoice_deliveries d LEFT JOIN users u ON u.id = d.recorded_by
            WHERE d.invoice_id = $1 ORDER BY d.delivered_on DESC, d.created_at DESC`,
          [req.params.id],
        ),
        db.query(
          `SELECT ch.*, a.amount AS allocated_amount, u.full_name AS received_by_name
             FROM cheque_allocations a
             JOIN cheques ch ON ch.id = a.cheque_id
             LEFT JOIN users u ON u.id = ch.received_by
            WHERE a.invoice_id = $1 ORDER BY ch.received_date`,
          [req.params.id],
        ),
        db.query(
          `SELECT a.id, a.file_name, a.mime_type, a.size_bytes, a.created_at, u.full_name AS uploaded_by_name
             FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
            WHERE a.entity_type = 'INVOICE' AND a.entity_id = $1 ORDER BY a.created_at`,
          [req.params.id],
        ),
      ]);

      res.json({
        ...mapInvoice(inv),
        deliveries: deliveries.rows.map((d) => ({
          id: d.id,
          deliveredOn: d.delivered_on,
          method: d.method,
          status: d.status,
          recipientType: d.recipient_type,
          recipientName: d.recipient_name,
          courierName: d.courier_name,
          trackingNo: d.tracking_no,
          note: d.note,
          recordedByName: d.recorded_by_name,
          createdAt: d.created_at,
        })),
        cheques: cheques.rows.map((c) => ({
          id: c.id,
          chequeNo: c.cheque_no,
          bankName: c.bank_name,
          amount: c.amount,
          allocatedAmount: c.allocated_amount,
          receivedDate: c.received_date,
          status: c.status,
          receivedByName: c.received_by_name,
        })),
        attachments: attachments.rows.map((a) => ({
          id: a.id,
          fileName: a.file_name,
          mimeType: a.mime_type,
          sizeBytes: Number(a.size_bytes),
          uploadedByName: a.uploaded_by_name,
          createdAt: a.created_at,
        })),
      });
    }),
  );

  /** ออกใบแจ้งหนี้ 1 ใบ */
  router.post(
    '/',
    authorize('ADMIN', 'ACCOUNTING', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const b = parse(createSchema, req.body);

      const created = await db.tx(async (client) => {
        const { rows } = await client.query(
          `SELECT c.*, h.id AS hid FROM contracts c JOIN hospitals h ON h.id = c.hospital_id WHERE c.id = $1`,
          [b.contractId],
        );
        const contract = rows[0];
        if (!contract) throw ApiError.notFound('ไม่พบสัญญา');

        let period = null;
        if (b.periodId) {
          const pr = await client.query('SELECT * FROM contract_periods WHERE id = $1 AND contract_id = $2', [
            b.periodId,
            b.contractId,
          ]);
          period = pr.rows[0];
          if (!period) throw ApiError.badRequest('ไม่พบงวดในสัญญานี้');
          const exist = await client.query(
            `SELECT invoice_no FROM invoices WHERE period_id = $1 AND status <> 'CANCELLED'`,
            [b.periodId],
          );
          if (exist.rowCount) throw ApiError.conflict(`งวดนี้ถูกออกใบแจ้งหนี้แล้ว (${exist.rows[0].invoice_no})`);
        }

        let amount;
        if (contract.pricing_mode === 'PAY_PER_USE') {
          if (b.amount !== undefined && b.amount !== null) amount = b.amount;
          else if (b.usageQty !== undefined && b.usageQty !== null) amount = round2(b.usageQty * Number(contract.unit_price));
          else throw ApiError.badRequest('สัญญาแบบจ่ายตามใช้ต้องระบุจำนวนหน่วยหรือยอดเงิน');
        } else {
          amount = b.amount ?? period?.expected_amount ?? contract.period_amount;
        }
        amount = round2(amount);
        if (!(amount > 0)) throw ApiError.badRequest('ยอดใบแจ้งหนี้ต้องมากกว่า 0');

        const vat = round2((amount * Number(contract.vat_rate)) / 100);
        const total = round2(amount + vat);
        const dueDate =
          b.dueDate ||
          new Date(new Date(b.issueDate).getTime() + Number(contract.payment_term_days) * 86400000)
            .toISOString()
            .slice(0, 10);
        const invoiceNo = b.invoiceNo || (await nextInvoiceNo(client, b.issueDate));

        const ins = await client.query(
          `INSERT INTO invoices (invoice_no, hospital_id, contract_id, period_id, issue_date, due_date,
                                 amount, vat_amount, total_amount, usage_qty, status, note, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ISSUED',$11,$12) RETURNING *`,
          [invoiceNo, contract.hospital_id, contract.id, b.periodId || null, b.issueDate, dueDate,
           amount, vat, total, b.usageQty ?? null, b.note ?? null, req.user.id],
        );
        return ins.rows[0];
      });

      await audit(db, req, {
        action: 'CREATE',
        entityType: 'INVOICE',
        entityId: created.id,
        payload: { invoiceNo: created.invoice_no, total: created.total_amount, periodId: created.period_id },
      });
      res.status(201).json({ id: created.id, invoiceNo: created.invoice_no, totalAmount: created.total_amount });
    }),
  );

  /** ออกใบแจ้งหนี้ให้ทุกงวดที่ค้าง (ไม่ระบุจำนวนเงิน เฉพาะสัญญา FIXED) */
  router.post(
    '/bulk',
    authorize('ADMIN', 'ACCOUNTING', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const b = parse(
        z.object({ periodIds: z.array(z.string().uuid()).min(1), issueDate: dateStr, dueDate: dateStr.optional().nullable() }),
        req.body,
      );

      const created = await db.tx(async (client) => {
        const out = [];
        for (const periodId of b.periodIds) {
          const pr = await client.query(
            `SELECT cp.*, c.*, c.id AS cid
               FROM contract_periods cp JOIN contracts c ON c.id = cp.contract_id
              WHERE cp.id = $1`,
            [periodId],
          );
          const row = pr.rows[0];
          if (!row) continue;
          if (row.pricing_mode !== 'FIXED') continue;
          const exist = await client.query(
            `SELECT 1 FROM invoices WHERE period_id = $1 AND status <> 'CANCELLED'`,
            [periodId],
          );
          if (exist.rowCount) continue;

          const amount = round2(row.expected_amount ?? row.period_amount);
          const vat = round2((amount * Number(row.vat_rate)) / 100);
          const total = round2(amount + vat);
          const invoiceNo = await nextInvoiceNo(client, b.issueDate);
          const dueDate =
            b.dueDate ||
            new Date(new Date(b.issueDate).getTime() + Number(row.payment_term_days) * 86400000)
              .toISOString()
              .slice(0, 10);

          const ins = await client.query(
            `INSERT INTO invoices (invoice_no, hospital_id, contract_id, period_id, issue_date, due_date,
                                   amount, vat_amount, total_amount, status, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ISSUED',$10) RETURNING id, invoice_no`,
            [invoiceNo, row.hospital_id, row.cid, periodId, b.issueDate, dueDate, amount, vat, total, req.user.id],
          );
          out.push({ periodId, id: ins.rows[0].id, invoiceNo: ins.rows[0].invoice_no });
        }
        return out;
      });

      await audit(db, req, { action: 'BULK_CREATE', entityType: 'INVOICE', payload: { count: created.length } });
      res.status(201).json({ createdCount: created.length, invoices: created });
    }),
  );

  router.patch(
    '/:id',
    authorize('ADMIN', 'ACCOUNTING', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const b = parse(
        z.object({
          dueDate: dateStr.optional(),
          note: z.string().optional().nullable(),
          usageQty: z.number().nonnegative().optional(),
        }),
        req.body,
      );
      const sets = [];
      const params = [];
      if (b.dueDate) { params.push(b.dueDate); sets.push(`due_date = $${params.length}`); }
      if (b.note !== undefined) { params.push(b.note); sets.push(`note = $${params.length}`); }
      if (b.usageQty !== undefined) { params.push(b.usageQty); sets.push(`usage_qty = $${params.length}`); }
      if (!sets.length) throw ApiError.badRequest('ไม่มีข้อมูลที่จะแก้ไข');
      params.push(req.params.id);
      const { rowCount } = await db.query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      if (!rowCount) throw ApiError.notFound('ไม่พบใบแจ้งหนี้');
      await audit(db, req, { action: 'UPDATE', entityType: 'INVOICE', entityId: req.params.id, payload: b });
      res.json({ ok: true });
    }),
  );

  router.post(
    '/:id/cancel',
    authorize('ADMIN', 'ACCOUNTING'),
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT COALESCE(SUM(amount),0) AS paid FROM cheque_allocations WHERE invoice_id = $1`,
        [req.params.id],
      );
      if (Number(rows[0].paid) > 0) throw ApiError.conflict('ใบแจ้งหนี้นี้มีการตัดชำระแล้ว ยกเลิกไม่ได้');
      const upd = await db.query(
        `UPDATE invoices SET status = 'CANCELLED', note = COALESCE(note,'') || ' [ยกเลิก]' WHERE id = $1 RETURNING invoice_no`,
        [req.params.id],
      );
      if (!upd.rowCount) throw ApiError.notFound('ไม่พบใบแจ้งหนี้');
      await audit(db, req, { action: 'CANCEL', entityType: 'INVOICE', entityId: req.params.id });
      res.json({ ok: true });
    }),
  );

  /** บันทึกการจัดส่งใบแจ้งหนี้ */
  router.post(
    '/:id/deliveries',
    authorize('ADMIN', 'ACCOUNTING', 'MANAGER', 'REP'),
    asyncHandler(async (req, res) => {
      const b = parse(deliverySchema, req.body);
      const { rowCount } = await db.query('SELECT 1 FROM invoices WHERE id = $1', [req.params.id]);
      if (!rowCount) throw ApiError.notFound('ไม่พบใบแจ้งหนี้');

      const { rows } = await db.query(
        `INSERT INTO invoice_deliveries
           (invoice_id, delivered_on, method, status, recipient_type, recipient_name, courier_name, tracking_no, note, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.params.id, b.deliveredOn, b.method, b.status, b.recipientType, b.recipientName ?? null,
         b.courierName ?? null, b.trackingNo ?? null, b.note ?? null, req.user.id],
      );
      await audit(db, req, {
        action: 'CREATE',
        entityType: 'INVOICE_DELIVERY',
        entityId: rows[0].id,
        payload: { invoiceId: req.params.id, ...b },
      });
      res.status(201).json({ id: rows[0].id });
    }),
  );

  router.delete(
    '/:invoiceId/deliveries/:deliveryId',
    authorize('ADMIN', 'MANAGER'),
    asyncHandler(async (req, res) => {
      await db.query('DELETE FROM invoice_deliveries WHERE id = $1 AND invoice_id = $2', [
        req.params.deliveryId,
        req.params.invoiceId,
      ]);
      await audit(db, req, {
        action: 'DELETE',
        entityType: 'INVOICE_DELIVERY',
        entityId: req.params.deliveryId,
      });
      res.json({ ok: true });
    }),
  );

  return router;
}
