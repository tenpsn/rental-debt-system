import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { authorize } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
const round2 = (v) => Math.round(Number(v) * 100) / 100;

const createSchema = z.object({
  chequeNo: z.string().min(1, 'กรุณากรอกเลขที่เช็ค'),
  bankName: z.string().min(1, 'กรุณากรอกธนาคาร'),
  bankBranch: z.string().optional().nullable(),
  amount: z.number().positive('จำนวนเงินต้องมากกว่า 0'),
  chequeDate: dateStr,
  receivedDate: dateStr,
  receivedBy: z.string().uuid().optional().nullable(),
  hospitalId: z.string().uuid(),
  deliveryMethod: z.enum(['REP_PICKUP', 'SENT_TO_COMPANY', 'REP_TO_COMPANY', 'HAND_DELIVERED']).default('REP_PICKUP'),
  companyReceivedDate: dateStr.optional().nullable(),
  note: z.string().optional().nullable(),
  allocations: z
    .array(z.object({ invoiceId: z.string().uuid(), amount: z.number().positive() }))
    .default([]),
});

const mapCheque = (c) => ({
  id: c.id,
  chequeNo: c.cheque_no,
  bankName: c.bank_name,
  bankBranch: c.bank_branch,
  amount: c.amount,
  chequeDate: c.cheque_date,
  receivedDate: c.received_date,
  receivedById: c.received_by,
  receivedByName: c.received_by_name,
  hospitalId: c.hospital_id,
  hospitalName: c.hospital_name,
  repName: c.rep_name,
  deliveryMethod: c.delivery_method,
  companyReceivedDate: c.company_received_date,
  status: c.status,
  note: c.note,
  allocatedAmount: Number(c.allocated_amount || 0),
  invoiceCount: Number(c.invoice_count || 0),
  attachmentCount: Number(c.attachment_count || 0),
  atCompany: Boolean(c.company_received_date),
});

export default function chequeRoutes(db) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const params = [];
      const where = ['TRUE'];
      if (req.user.role === 'REP') {
        params.push(req.user.id);
        where.push(`(h.rep_id = $${params.length} OR ch.received_by = $${params.length})`);
      } else if (req.query.rep_id) {
        params.push(req.query.rep_id);
        where.push(`h.rep_id = $${params.length}`);
      }
      if (req.query.hospital_id) {
        params.push(req.query.hospital_id);
        where.push(`ch.hospital_id = $${params.length}`);
      }
      if (req.query.status) {
        params.push(req.query.status);
        where.push(`ch.status = $${params.length}`);
      }
      if (req.query.date_from) {
        params.push(req.query.date_from);
        where.push(`ch.received_date >= $${params.length}`);
      }
      if (req.query.date_to) {
        params.push(req.query.date_to);
        where.push(`ch.received_date <= $${params.length}`);
      }
      if (req.query.not_at_company === 'true') where.push('ch.company_received_date IS NULL');
      if (req.query.search) {
        params.push(`%${req.query.search}%`);
        where.push(`(ch.cheque_no ILIKE $${params.length} OR ch.bank_name ILIKE $${params.length} OR h.name ILIKE $${params.length})`);
      }

      const { rows } = await db.query(
        `SELECT ch.*, h.name AS hospital_name, u.full_name AS received_by_name, rp.full_name AS rep_name,
                COALESCE(a.allocated_amount, 0) AS allocated_amount,
                COALESCE(a.invoice_count, 0) AS invoice_count,
                COALESCE(att.n, 0) AS attachment_count
           FROM cheques ch
           JOIN hospitals h ON h.id = ch.hospital_id
           LEFT JOIN users u ON u.id = ch.received_by
           LEFT JOIN users rp ON rp.id = h.rep_id
           LEFT JOIN LATERAL (
             SELECT SUM(amount) AS allocated_amount, COUNT(*) AS invoice_count
               FROM cheque_allocations WHERE cheque_id = ch.id
           ) a ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS n FROM attachments WHERE entity_type = 'CHEQUE' AND entity_id = ch.id
           ) att ON TRUE
          WHERE ${where.join(' AND ')}
          ORDER BY ch.received_date DESC, ch.created_at DESC
          LIMIT 1000`,
        params,
      );
      res.json(rows.map(mapCheque));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT ch.*, h.name AS hospital_name, u.full_name AS received_by_name, rp.full_name AS rep_name,
                COALESCE(a.allocated_amount, 0) AS allocated_amount
           FROM cheques ch
           JOIN hospitals h ON h.id = ch.hospital_id
           LEFT JOIN users u ON u.id = ch.received_by
           LEFT JOIN users rp ON rp.id = h.rep_id
           LEFT JOIN LATERAL (SELECT SUM(amount) AS allocated_amount FROM cheque_allocations WHERE cheque_id = ch.id) a ON TRUE
          WHERE ch.id = $1`,
        [req.params.id],
      );
      const cheque = rows[0];
      if (!cheque) throw ApiError.notFound('ไม่พบเช็ค');

      const [allocations, attachments] = await Promise.all([
        db.query(
          `SELECT a.*, v.invoice_no, v.total_amount, v.issue_date, v.due_date, v.payment_state
             FROM cheque_allocations a
             JOIN v_invoice_receivable v ON v.id = a.invoice_id
            WHERE a.cheque_id = $1 ORDER BY v.invoice_no`,
          [req.params.id],
        ),
        db.query(
          `SELECT a.id, a.file_name, a.mime_type, a.size_bytes, a.created_at, u.full_name AS uploaded_by_name
             FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
            WHERE a.entity_type = 'CHEQUE' AND a.entity_id = $1 ORDER BY a.created_at`,
          [req.params.id],
        ),
      ]);

      res.json({
        ...mapCheque(cheque),
        // นับจำนวนใบแจ้งหนี้จากรายการตัดชำระจริง
        invoiceCount: allocations.rowCount,
        allocations: allocations.rows.map((a) => ({
          id: a.id,
          invoiceId: a.invoice_id,
          invoiceNo: a.invoice_no,
          invoiceTotal: a.total_amount,
          issueDate: a.issue_date,
          dueDate: a.due_date,
          paymentState: a.payment_state,
          amount: a.amount,
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

  router.post(
    '/',
    authorize('ADMIN', 'ACCOUNTING', 'MANAGER', 'REP'),
    asyncHandler(async (req, res) => {
      const b = parse(createSchema, req.body);

      const created = await db.tx(async (client) => {
        const h = await client.query('SELECT rep_id FROM hospitals WHERE id = $1', [b.hospitalId]);
        if (!h.rowCount) throw ApiError.badRequest('ไม่พบโรงพยาบาล');
        if (req.user.role === 'REP' && h.rows[0].rep_id !== req.user.id) {
          throw ApiError.forbidden('รับเช็คได้เฉพาะโรงพยาบาลในพื้นที่ที่รับผิดชอบ');
        }

        const totalAllocated = round2(b.allocations.reduce((sum, a) => sum + a.amount, 0));
        if (totalAllocated > round2(b.amount) + 0.01) {
          throw ApiError.badRequest('ยอดตัดชำระรวมมากกว่ายอดเช็ค');
        }

        for (const a of b.allocations) {
          const inv = await client.query(
            `SELECT v.id, v.hospital_id, v.outstanding_amount FROM v_invoice_receivable v
              WHERE v.id = $1 AND v.status <> 'CANCELLED'`,
            [a.invoiceId],
          );
          if (!inv.rowCount) throw ApiError.badRequest(`ไม่พบใบแจ้งหนี้ ${a.invoiceId}`);
          if (inv.rows[0].hospital_id !== b.hospitalId) {
            throw ApiError.badRequest('ใบแจ้งหนี้ไม่ได้เป็นของโรงพยาบาลเดียวกับเช็ค');
          }
          if (round2(a.amount) > round2(inv.rows[0].outstanding_amount) + 0.01) {
            throw ApiError.badRequest('ยอดตัดชำระมากกว่ายอดค้างของใบแจ้งหนี้');
          }
        }

        const ins = await client.query(
          `INSERT INTO cheques (cheque_no, bank_name, bank_branch, amount, cheque_date, received_date,
                               received_by, hospital_id, delivery_method, company_received_date, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [b.chequeNo, b.bankName, b.bankBranch ?? null, b.amount, b.chequeDate, b.receivedDate,
           b.receivedBy || req.user.id, b.hospitalId, b.deliveryMethod, b.companyReceivedDate ?? null, b.note ?? null],
        );
        const cheque = ins.rows[0];

        for (const a of b.allocations) {
          await client.query('INSERT INTO cheque_allocations (cheque_id, invoice_id, amount) VALUES ($1,$2,$3)', [
            cheque.id,
            a.invoiceId,
            a.amount,
          ]);
        }
        return cheque;
      });

      await audit(db, req, {
        action: 'CREATE',
        entityType: 'CHEQUE',
        entityId: created.id,
        payload: { chequeNo: b.chequeNo, amount: b.amount, hospitalId: b.hospitalId, allocations: b.allocations.length },
      });
      res.status(201).json({ id: created.id });
    }),
  );

  router.patch(
    '/:id',
    authorize('ADMIN', 'ACCOUNTING', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const b = parse(
        z.object({
          status: z.enum(['RECEIVED', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED']).optional(),
          companyReceivedDate: dateStr.optional().nullable(),
          note: z.string().optional().nullable(),
        }),
        req.body,
      );
      const sets = [];
      const params = [];
      if (b.status) { params.push(b.status); sets.push(`status = $${params.length}`); }
      if (b.companyReceivedDate !== undefined) { params.push(b.companyReceivedDate); sets.push(`company_received_date = $${params.length}`); }
      if (b.note !== undefined) { params.push(b.note); sets.push(`note = $${params.length}`); }
      if (!sets.length) throw ApiError.badRequest('ไม่มีข้อมูลที่จะแก้ไข');
      params.push(req.params.id);
      const { rowCount } = await db.query(`UPDATE cheques SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      if (!rowCount) throw ApiError.notFound('ไม่พบเช็ค');
      await audit(db, req, { action: 'UPDATE', entityType: 'CHEQUE', entityId: req.params.id, payload: b });
      res.json({ ok: true });
    }),
  );

  return router;
}
