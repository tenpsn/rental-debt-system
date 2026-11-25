import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { authorize } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { regeneratePeriods, buildPeriods } from '../services/periods.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');

const contractSchema = z.object({
  contractNo: z.string().min(1, 'กรุณากรอกเลขที่สัญญา'),
  hospitalId: z.string().uuid('ต้องระบุโรงพยาบาล'),
  contractType: z.enum(['LEASE', 'PURCHASE_ORDER', 'SHORT_TERM']).default('LEASE'),
  title: z.string().optional().nullable(),
  startDate: dateStr,
  endDate: dateStr,
  billingCycle: z.enum(['MONTHLY', 'EVERY_10_DAYS', 'EVERY_15_DAYS']).default('MONTHLY'),
  pricingMode: z.enum(['FIXED', 'PAY_PER_USE']).default('FIXED'),
  periodAmount: z.number().nonnegative().optional().nullable(),
  unitPrice: z.number().nonnegative().optional().nullable(),
  unitName: z.string().optional().nullable(),
  paymentTermDays: z.number().int().min(0).max(365).default(30),
  vatRate: z.number().min(0).max(100).default(7),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']).default('ACTIVE'),
  renewalOfId: z.string().uuid().optional().nullable(),
  note: z.string().optional().nullable(),
  equipment: z
    .array(
      z.object({
        name: z.string().min(1),
        model: z.string().optional().nullable(),
        serialNo: z.string().optional().nullable(),
        qty: z.number().int().positive().default(1),
        note: z.string().optional().nullable(),
      }),
    )
    .optional(),
});

const mapContract = (c) => ({
  id: c.id,
  contractNo: c.contract_no,
  hospitalId: c.hospital_id,
  hospitalName: c.hospital_name,
  hospitalCode: c.hospital_code,
  repId: c.rep_id,
  repName: c.rep_name,
  regionName: c.region_name,
  contractType: c.contract_type,
  title: c.title,
  startDate: c.start_date,
  endDate: c.end_date,
  billingCycle: c.billing_cycle,
  pricingMode: c.pricing_mode,
  periodAmount: c.period_amount,
  unitPrice: c.unit_price,
  unitName: c.unit_name,
  paymentTermDays: c.payment_term_days,
  vatRate: c.vat_rate,
  status: c.status,
  note: c.note,
  totalPeriods: Number(c.total_periods || 0),
  invoicedPeriods: Number(c.invoiced_periods || 0),
  invoicedAmount: Number(c.invoiced_amount || 0),
  collectedAmount: Number(c.collected_amount || 0),
  outstandingAmount: Number(c.outstanding_amount || 0),
  remainingValue: Number(c.remaining_value || 0),
  nextDueDate: c.next_due_date,
});

export default function contractRoutes(db) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const params = [];
      const where = ["c.status <> 'CANCELLED'"];
      if (req.user.role === 'REP') {
        params.push(req.user.id);
        where.push(`h.rep_id = $${params.length}`);
      } else if (req.query.rep_id) {
        params.push(req.query.rep_id);
        where.push(`h.rep_id = $${params.length}`);
      }
      if (req.query.hospital_id) {
        params.push(req.query.hospital_id);
        where.push(`c.hospital_id = $${params.length}`);
      }
      if (req.query.region_id) {
        params.push(Number(req.query.region_id));
        where.push(`h.region_id = $${params.length}`);
      }
      if (req.query.status) {
        params.push(req.query.status);
        where.push(`c.status = $${params.length}`);
      }
      if (req.query.search) {
        params.push(`%${req.query.search}%`);
        where.push(`(c.contract_no ILIKE $${params.length} OR h.name ILIKE $${params.length})`);
      }

      const { rows } = await db.query(
        `SELECT c.*, h.name AS hospital_name, h.code AS hospital_code, h.rep_id,
                u.full_name AS rep_name, r.name AS region_name,
                per.total_periods, per.invoiced_periods, per.remaining_value, per.next_due_date,
                COALESCE(inv.invoiced_amount, 0) AS invoiced_amount,
                COALESCE(inv.collected_amount, 0) AS collected_amount,
                COALESCE(inv.outstanding_amount, 0) AS outstanding_amount
           FROM contracts c
           JOIN hospitals h ON h.id = c.hospital_id
           LEFT JOIN users u ON u.id = h.rep_id
           LEFT JOIN regions r ON r.id = h.region_id
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS total_periods,
                    COUNT(*) FILTER (WHERE inv.invoice_id IS NOT NULL) AS invoiced_periods,
                    COALESCE(SUM(COALESCE(cp.expected_amount, 0)) FILTER (WHERE inv.invoice_id IS NULL), 0) AS remaining_value,
                    MIN(cp.due_date) FILTER (WHERE inv.invoice_id IS NULL) AS next_due_date
               FROM contract_periods cp
               LEFT JOIN LATERAL (
                 SELECT i.id AS invoice_id FROM invoices i
                  WHERE i.period_id = cp.id AND i.status <> 'CANCELLED' LIMIT 1
               ) inv ON TRUE
              WHERE cp.contract_id = c.id
           ) per ON TRUE
           LEFT JOIN LATERAL (
             SELECT SUM(v.total_amount) AS invoiced_amount,
                    SUM(v.cheque_received_amount) AS collected_amount,
                    SUM(v.outstanding_amount) AS outstanding_amount
               FROM v_invoice_receivable v
              WHERE v.contract_id = c.id AND v.status <> 'CANCELLED'
           ) inv ON TRUE
          WHERE ${where.join(' AND ')}
          ORDER BY h.name, c.start_date DESC`,
        params,
      );
      res.json(rows.map(mapContract));
    }),
  );

  router.get(
    '/preview-periods',
    asyncHandler(async (req, res) => {
      const { start, end, cycle, term, mode, amount } = req.query;
      if (!start || !end) throw ApiError.badRequest('ต้องระบุ start และ end');
      const periods = buildPeriods({
        startDate: start,
        endDate: end,
        billingCycle: cycle || 'MONTHLY',
        paymentTermDays: Number(term || 30),
        pricingMode: mode || 'FIXED',
        periodAmount: amount ? Number(amount) : null,
      });
      res.json({ count: periods.length, periods });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT c.*, h.name AS hospital_name, h.code AS hospital_code, h.province, h.rep_id,
                u.full_name AS rep_name, r.name AS region_name
           FROM contracts c
           JOIN hospitals h ON h.id = c.hospital_id
           LEFT JOIN users u ON u.id = h.rep_id
           LEFT JOIN regions r ON r.id = h.region_id
          WHERE c.id = $1`,
        [req.params.id],
      );
      const contract = rows[0];
      if (!contract) throw ApiError.notFound('ไม่พบสัญญา');

      const [periods, equipment] = await Promise.all([
        db.query(
          `SELECT cp.*, v.id AS invoice_id, v.invoice_no, v.total_amount, v.outstanding_amount,
                  v.payment_state, v.last_delivered_on, v.days_overdue, v.cheque_received_amount,
                  (cp.due_date < CURRENT_DATE AND v.id IS NULL) AS is_overdue_uninvoiced
             FROM contract_periods cp
             LEFT JOIN v_invoice_receivable v ON v.period_id = cp.id AND v.status <> 'CANCELLED'
            WHERE cp.contract_id = $1
            ORDER BY cp.period_no`,
          [req.params.id],
        ),
        db.query('SELECT * FROM equipment WHERE contract_id = $1 ORDER BY name', [req.params.id]),
      ]);

      // คำนวณยอดสรุปจากงวดทั้งหมด ให้ตรงกับหน้ารายการสัญญา
      const sumBy = (rows, key) =>
        Math.round(rows.reduce((total, row) => total + Number(row[key] || 0), 0) * 100) / 100;
      const invoicedRows = periods.rows.filter((p) => p.invoice_id);
      const uninvoicedRows = periods.rows.filter((p) => !p.invoice_id);
      const uninvoicedDueDates = uninvoicedRows.map((p) => p.due_date).filter(Boolean).sort();

      res.json({
        ...mapContract(contract),
        totalPeriods: periods.rowCount,
        invoicedPeriods: invoicedRows.length,
        invoicedAmount: sumBy(invoicedRows, 'total_amount'),
        collectedAmount: sumBy(invoicedRows, 'cheque_received_amount'),
        outstandingAmount: sumBy(invoicedRows, 'outstanding_amount'),
        remainingValue: sumBy(uninvoicedRows, 'expected_amount'),
        nextDueDate: uninvoicedDueDates[0] || null,
        periods: periods.rows.map((p) => ({
          id: p.id,
          periodNo: p.period_no,
          periodStart: p.period_start,
          periodEnd: p.period_end,
          dueDate: p.due_date,
          expectedAmount: p.expected_amount,
          invoiceId: p.invoice_id,
          invoiceNo: p.invoice_no,
          totalAmount: p.total_amount,
          outstandingAmount: p.outstanding_amount,
          paymentState: p.payment_state,
          lastDeliveredOn: p.last_delivered_on,
          daysOverdue: Number(p.days_overdue || 0),
          isOverdueUninvoiced: p.is_overdue_uninvoiced,
        })),
        equipment: equipment.rows.map((e) => ({
          id: e.id, name: e.name, model: e.model, serialNo: e.serial_no, qty: e.qty, note: e.note,
        })),
      });
    }),
  );

  router.post(
    '/',
    authorize('ADMIN', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const b = parse(contractSchema, req.body);
      if (b.pricingMode === 'FIXED' && (b.periodAmount === null || b.periodAmount === undefined)) {
        throw ApiError.badRequest('สัญญาแบบเหมารายงวดต้องระบุค่าเช่าต่องวด');
      }
      if (b.pricingMode === 'PAY_PER_USE' && (b.unitPrice === null || b.unitPrice === undefined)) {
        throw ApiError.badRequest('สัญญาแบบจ่ายตามใช้ต้องระบุราคาต่อหน่วย');
      }

      const created = await db.tx(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO contracts
             (contract_no, hospital_id, contract_type, title, start_date, end_date, billing_cycle,
              pricing_mode, period_amount, unit_price, unit_name, payment_term_days, vat_rate,
              status, renewal_of_id, note, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           RETURNING *`,
          [
            b.contractNo, b.hospitalId, b.contractType, b.title, b.startDate, b.endDate, b.billingCycle,
            b.pricingMode, b.periodAmount ?? null, b.unitPrice ?? null, b.unitName ?? null,
            b.paymentTermDays, b.vatRate, b.status, b.renewalOfId ?? null, b.note ?? null, req.user.id,
          ],
        );
        const contract = rows[0];
        const periodCount = await regeneratePeriods(client, contract);
        for (const e of b.equipment || []) {
          await client.query(
            `INSERT INTO equipment (contract_id, name, model, serial_no, qty, note) VALUES ($1,$2,$3,$4,$5,$6)`,
            [contract.id, e.name, e.model ?? null, e.serialNo ?? null, e.qty, e.note ?? null],
          );
        }
        return { contract, periodCount };
      });

      await audit(db, req, {
        action: 'CREATE',
        entityType: 'CONTRACT',
        entityId: created.contract.id,
        payload: { ...b, periods: created.periodCount },
      });
      res.status(201).json({ id: created.contract.id, periodCount: created.periodCount });
    }),
  );

  router.patch(
    '/:id',
    authorize('ADMIN', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const b = parse(contractSchema.partial(), req.body);
      const result = await db.tx(async (client) => {
        const { rows } = await client.query('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [req.params.id]);
        const current = rows[0];
        if (!current) throw ApiError.notFound('ไม่พบสัญญา');

        const map = {
          contractNo: 'contract_no', hospitalId: 'hospital_id', contractType: 'contract_type', title: 'title',
          startDate: 'start_date', endDate: 'end_date', billingCycle: 'billing_cycle', pricingMode: 'pricing_mode',
          periodAmount: 'period_amount', unitPrice: 'unit_price', unitName: 'unit_name',
          paymentTermDays: 'payment_term_days', vatRate: 'vat_rate', status: 'status', note: 'note',
        };
        const sets = [];
        const params = [];
        for (const [key, col] of Object.entries(map)) {
          if (b[key] !== undefined) {
            params.push(b[key]);
            sets.push(`${col} = $${params.length}`);
          }
        }
        if (!sets.length) throw ApiError.badRequest('ไม่มีข้อมูลที่จะแก้ไข');
        params.push(req.params.id);
        const updated = await client.query(
          `UPDATE contracts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
          params,
        );
        const contract = updated.rows[0];

        const datesChanged =
          b.startDate !== undefined || b.endDate !== undefined || b.billingCycle !== undefined ||
          b.paymentTermDays !== undefined || b.periodAmount !== undefined;

        let regenerated = false;
        if (datesChanged) {
          const { rows: used } = await client.query(
            `SELECT COUNT(*)::int AS n FROM invoices WHERE contract_id = $1 AND status <> 'CANCELLED'`,
            [contract.id],
          );
          if (used[0].n > 0 && req.query.force !== 'true') {
            throw ApiError.conflict(
              'สัญญานี้มีใบแจ้งหนี้แล้ว การเปลี่ยนเงื่อนไขจะต้องยืนยัน (force=true) และงวดที่ออกใบแจ้งหนี้แล้วจะหายไป',
              { invoices: used[0].n },
            );
          }
          await regeneratePeriods(client, contract);
          regenerated = true;
        }
        return { contract, regenerated };
      });

      await audit(db, req, {
        action: 'UPDATE',
        entityType: 'CONTRACT',
        entityId: req.params.id,
        payload: { ...b, regenerated: result.regenerated },
      });
      res.json({ ok: true, regenerated: result.regenerated });
    }),
  );

  /** ต่อสัญญาใหม่จากสัญญาเดิม (คัดลอกเงื่อนไข + เครื่อง) */
  router.post(
    '/:id/renew',
    authorize('ADMIN', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const b = parse(contractSchema.partial({ contractNo: true, hospitalId: true }).extend({
        contractNo: z.string().min(1),
        startDate: dateStr,
        endDate: dateStr,
      }), req.body);

      const created = await db.tx(async (client) => {
        const { rows } = await client.query('SELECT * FROM contracts WHERE id = $1', [req.params.id]);
        const prev = rows[0];
        if (!prev) throw ApiError.notFound('ไม่พบสัญญาเดิม');

        const { rows: newRows } = await client.query(
          `INSERT INTO contracts
             (contract_no, hospital_id, contract_type, title, start_date, end_date, billing_cycle,
              pricing_mode, period_amount, unit_price, unit_name, payment_term_days, vat_rate, status,
              renewal_of_id, note, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ACTIVE',$14,$15,$16)
           RETURNING *`,
          [
            b.contractNo, b.hospitalId || prev.hospital_id, b.contractType || prev.contract_type,
            b.title ?? prev.title, b.startDate, b.endDate, b.billingCycle || prev.billing_cycle,
            b.pricingMode || prev.pricing_mode, b.periodAmount ?? prev.period_amount,
            b.unitPrice ?? prev.unit_price, b.unitName ?? prev.unit_name,
            b.paymentTermDays ?? prev.payment_term_days, b.vatRate ?? prev.vat_rate,
            prev.id, b.note ?? null, req.user.id,
          ],
        );
        const contract = newRows[0];
        const periodCount = await regeneratePeriods(client, contract);
        await client.query(
          `INSERT INTO equipment (contract_id, name, model, serial_no, qty, note)
           SELECT $1, name, model, serial_no, qty, note FROM equipment WHERE contract_id = $2`,
          [contract.id, prev.id],
        );
        return { contract, periodCount };
      });

      await audit(db, req, {
        action: 'RENEW',
        entityType: 'CONTRACT',
        entityId: created.contract.id,
        payload: { from: req.params.id, contractNo: b.contractNo, periods: created.periodCount },
      });
      res.status(201).json({ id: created.contract.id, periodCount: created.periodCount });
    }),
  );

  router.delete(
    '/:id',
    authorize('ADMIN'),
    asyncHandler(async (req, res) => {
      await db.query(`UPDATE contracts SET status = 'CANCELLED' WHERE id = $1`, [req.params.id]);
      await audit(db, req, { action: 'CANCEL', entityType: 'CONTRACT', entityId: req.params.id });
      res.json({ ok: true });
    }),
  );

  return router;
}
