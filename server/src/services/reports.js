/**
 * บริการคำนวณรายงาน/สรุปภาพรวม
 *
 * หลักการคิด (ตรงตามข้อกำหนดธุรกิจ)
 * - งวดที่ถึงกำหนดแล้วยังไม่แจ้งหนี้ = งวดที่ due_date <= วันปัจจุบัน และยังไม่มีใบแจ้งหนี้ที่ใช้งานอยู่
 * - มูลค่าคงเหลือในสัญญา = ผลรวมของงวดที่ยังไม่แจ้งหนี้ × มูลค่างวด
 *     FIXED        → period_amount
 *     PAY_PER_USE  → ค่าเฉลี่ยยอดใบแจ้งหนี้ต่องวดของสัญญานั้น (ถ้ายังไม่มีประวัติ = 0)
 * - รับเช็คแล้ว = มีเช็คที่ยังไม่ถูกคืน/เด้ง ผูกกับใบแจ้งหนี้
 * - อายุหนี้ (aging) นับจาก due_date ของใบแจ้งหนี้ ถึงวันปัจจุบัน
 */

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const round2 = (v) => Math.round(num(v) * 100) / 100;

class Params {
  constructor() {
    this.values = [];
  }
  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function scopeClause(p, { repId, regionId, hospitalId, contractId } = {}, prefix = 'h') {
  const parts = [];
  if (repId) parts.push(`${prefix}.rep_id = ${p.add(repId)}`);
  if (regionId) parts.push(`${prefix}.region_id = ${p.add(regionId)}`);
  if (hospitalId) parts.push(`${prefix}.id = ${p.add(hospitalId)}`);
  if (contractId) parts.push(`c.id = ${p.add(contractId)}`);
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}

function dateClause(p, column, { dateFrom, dateTo } = {}) {
  const parts = [];
  if (dateFrom) parts.push(`${column} >= ${p.add(dateFrom)}`);
  if (dateTo) parts.push(`${column} <= ${p.add(dateTo)}`);
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}

const PERIODS_CTE = `
  base AS (
    SELECT cp.id, cp.contract_id, cp.period_no, cp.period_start, cp.period_end, cp.due_date,
           cp.expected_amount, c.pricing_mode, c.period_amount,
           inv.invoice_id,
           COALESCE(cp.expected_amount, est.avg_amount, 0) AS estimated_amount
      FROM contract_periods cp
      JOIN contracts c ON c.id = cp.contract_id
      JOIN hospitals h ON h.id = c.hospital_id
      LEFT JOIN LATERAL (
             SELECT i.id AS invoice_id FROM invoices i
              WHERE i.period_id = cp.id AND i.status <> 'CANCELLED'
              LIMIT 1
           ) inv ON TRUE
      LEFT JOIN LATERAL (
             SELECT AVG(i.amount) AS avg_amount FROM invoices i
              WHERE i.contract_id = cp.contract_id AND i.status <> 'CANCELLED'
           ) est ON TRUE
     WHERE c.status <> 'CANCELLED'
`;

export function createReportsService(db) {
  async function periodMetrics(filters = {}) {
    const p = new Params();
    const filter = scopeClause(p, filters);
    const asOf = p.add(filters.asOf || new Date().toISOString().slice(0, 10));

    const sql = `
      WITH ${PERIODS_CTE} ${filter}
      )
      SELECT
        COUNT(*)::int                                                              AS total_periods,
        COUNT(invoice_id)::int                                                     AS invoiced_periods,
        (COUNT(*) - COUNT(invoice_id))::int                                        AS not_invoiced_periods,
        COUNT(*) FILTER (WHERE invoice_id IS NULL AND period_start <= ${asOf})::int AS due_not_invoiced_periods,
        COALESCE(SUM(estimated_amount) FILTER (WHERE invoice_id IS NULL AND period_start <= ${asOf}), 0) AS due_not_invoiced_amount,
        COALESCE(SUM(estimated_amount) FILTER (WHERE invoice_id IS NULL), 0)       AS remaining_value,
        COUNT(*) FILTER (WHERE invoice_id IS NULL AND due_date <= ${asOf} AND due_date > ${asOf} - 30)::int AS overdue_1_30,
        COUNT(*) FILTER (WHERE invoice_id IS NULL AND due_date <= ${asOf} - 30 AND due_date > ${asOf} - 60)::int AS overdue_31_60,
        COUNT(*) FILTER (WHERE invoice_id IS NULL AND due_date <= ${asOf} - 60)::int AS overdue_60_plus
      FROM base`;
    const { rows } = await db.query(sql, p.values);
    const r = rows[0] || {};
    return {
      totalPeriods: num(r.total_periods),
      invoicedPeriods: num(r.invoiced_periods),
      notInvoicedPeriods: num(r.not_invoiced_periods),
      dueNotInvoicedPeriods: num(r.due_not_invoiced_periods),
      dueNotInvoicedAmount: round2(r.due_not_invoiced_amount),
      remainingValue: round2(r.remaining_value),
    };
  }

  async function invoiceMetrics(filters = {}) {
    const p = new Params();
    const filter = scopeClause(p, filters);
    const dates = dateClause(p, 'v.issue_date', filters);

    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE v.status <> 'CANCELLED')::int AS invoice_count,
        COALESCE(SUM(v.total_amount) FILTER (WHERE v.status <> 'CANCELLED'), 0) AS invoice_amount,
        COUNT(*) FILTER (WHERE v.status <> 'CANCELLED' AND v.last_delivered_on IS NOT NULL)::int AS delivered_count,
        COALESCE(SUM(v.total_amount) FILTER (WHERE v.status <> 'CANCELLED' AND v.last_delivered_on IS NOT NULL), 0) AS delivered_amount,
        COUNT(*) FILTER (WHERE v.status <> 'CANCELLED' AND v.last_delivered_on IS NULL)::int AS undelivered_count,
        COALESCE(SUM(v.total_amount) FILTER (WHERE v.status <> 'CANCELLED' AND v.last_delivered_on IS NULL), 0) AS undelivered_amount,
        COUNT(*) FILTER (WHERE v.status <> 'CANCELLED' AND v.cheque_received_amount > 0)::int AS cheque_count,
        COALESCE(SUM(v.cheque_received_amount) FILTER (WHERE v.status <> 'CANCELLED'), 0) AS cheque_amount,
        COALESCE(SUM(v.cleared_amount) FILTER (WHERE v.status <> 'CANCELLED'), 0) AS cleared_amount,
        COUNT(*) FILTER (WHERE v.status <> 'CANCELLED' AND v.outstanding_amount > 0)::int AS awaiting_count,
        COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.status <> 'CANCELLED'), 0) AS awaiting_amount,
        COUNT(*) FILTER (WHERE v.status <> 'CANCELLED' AND v.days_overdue > 0 AND v.outstanding_amount > 0)::int AS overdue_count,
        COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.status <> 'CANCELLED' AND v.days_overdue > 0), 0) AS overdue_amount,
        COUNT(*) FILTER (WHERE v.status <> 'CANCELLED' AND v.attachment_count = 0)::int AS invoices_without_file
      FROM v_invoice_receivable v
      JOIN hospitals h ON h.id = v.hospital_id
      JOIN contracts c ON c.id = v.contract_id
      WHERE TRUE ${filter} ${dates}`;
    const { rows } = await db.query(sql, p.values);
    const r = rows[0] || {};
    return {
      invoiceCount: num(r.invoice_count),
      invoiceAmount: round2(r.invoice_amount),
      deliveredCount: num(r.delivered_count),
      deliveredAmount: round2(r.delivered_amount),
      undeliveredCount: num(r.undelivered_count),
      undeliveredAmount: round2(r.undelivered_amount),
      chequeCount: num(r.cheque_count),
      chequeAmount: round2(r.cheque_amount),
      clearedAmount: round2(r.cleared_amount),
      awaitingCount: num(r.awaiting_count),
      awaitingAmount: round2(r.awaiting_amount),
      overdueCount: num(r.overdue_count),
      overdueAmount: round2(r.overdue_amount),
      invoicesWithoutFile: num(r.invoices_without_file),
    };
  }

  async function aging(filters = {}) {
    const p = new Params();
    const filter = scopeClause(p, filters);
    const sql = `
      SELECT
        CASE
          WHEN v.days_overdue <= 0 THEN 'NOT_DUE'
          WHEN v.days_overdue <= 30 THEN 'D1_30'
          WHEN v.days_overdue <= 60 THEN 'D31_60'
          WHEN v.days_overdue <= 90 THEN 'D61_90'
          ELSE 'D90_PLUS'
        END AS bucket,
        COUNT(*)::int AS count,
        COALESCE(SUM(v.outstanding_amount), 0) AS amount
      FROM v_invoice_receivable v
      JOIN hospitals h ON h.id = v.hospital_id
      JOIN contracts c ON c.id = v.contract_id
      WHERE v.status <> 'CANCELLED' AND v.outstanding_amount > 0 ${filter}
      GROUP BY 1`;
    const { rows } = await db.query(sql, p.values);
    const labels = {
      NOT_DUE: 'ยังไม่ครบกำหนด',
      D1_30: 'เกินกำหนด 1-30 วัน',
      D31_60: 'เกินกำหนด 31-60 วัน',
      D61_90: 'เกินกำหนด 61-90 วัน',
      D90_PLUS: 'เกินกำหนดมากกว่า 90 วัน',
    };
    const order = ['NOT_DUE', 'D1_30', 'D31_60', 'D61_90', 'D90_PLUS'];
    const map = new Map(rows.map((r) => [r.bucket, r]));
    return order.map((key) => {
      const hit = map.get(key);
      return {
        bucket: key,
        label: labels[key],
        count: num(hit?.count),
        amount: round2(hit?.amount),
      };
    });
  }

  async function contractSummary(filters = {}) {
    const p = new Params();
    const filter = scopeClause(p, filters);
    const asOf = p.add(filters.asOf || new Date().toISOString().slice(0, 10));
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE c.status = 'ACTIVE')::int AS active_count,
        COUNT(*) FILTER (WHERE c.status <> 'CANCELLED' AND c.end_date < ${asOf})::int AS expired_count,
        COUNT(*) FILTER (WHERE c.status <> 'CANCELLED' AND c.end_date BETWEEN ${asOf} AND ${asOf}::date + 90)::int AS expiring_soon
      FROM contracts c
      JOIN hospitals h ON h.id = c.hospital_id
      WHERE c.status <> 'CANCELLED' ${filter}`;
    const { rows } = await db.query(sql, p.values);
    const r = rows[0] || {};
    return {
      activeCount: num(r.active_count),
      expiredCount: num(r.expired_count),
      expiringSoonCount: num(r.expiring_soon),
    };
  }

  /** รายงานแยกตามผู้แทน (dimension = 'rep') หรือตามโรงพยาบาล (dimension = 'hospital') */
  async function grouped(filters = {}, dimension = 'rep') {
    const isRep = dimension === 'rep';
    const asOf = filters.asOf || new Date().toISOString().slice(0, 10);
    const groupExpr = isRep ? 'h.rep_id' : 'h.id';

    // --- 1) ตัวชี้วัดจากใบแจ้งหนี้ ---
    const p1 = new Params();
    const filter1 = scopeClause(p1, filters);
    const invSql = `
      SELECT
        ${groupExpr} AS group_id,
        ${isRep ? "COALESCE(u.full_name, 'ยังไม่กำหนดผู้แทน')" : 'h.name'} AS group_name,
        ${isRep ? 'r.name' : "COALESCE(u.full_name, 'ยังไม่กำหนดผู้แทน')"} AS sub_label,
        COUNT(DISTINCT h.id)::int AS hospital_count,
        COUNT(*) FILTER (WHERE v.status <> 'CANCELLED')::int AS invoice_count,
        COALESCE(SUM(v.total_amount) FILTER (WHERE v.status <> 'CANCELLED'), 0) AS invoice_amount,
        COALESCE(SUM(v.cheque_received_amount) FILTER (WHERE v.status <> 'CANCELLED'), 0) AS cheque_amount,
        COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.status <> 'CANCELLED'), 0) AS awaiting_amount,
        COUNT(*) FILTER (WHERE v.status <> 'CANCELLED' AND v.days_overdue > 0 AND v.outstanding_amount > 0)::int AS overdue_count,
        COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.status <> 'CANCELLED' AND v.days_overdue > 0), 0) AS overdue_amount
      FROM v_invoice_receivable v
      JOIN hospitals h ON h.id = v.hospital_id
      JOIN contracts c ON c.id = v.contract_id
      ${isRep ? 'LEFT JOIN users u ON u.id = h.rep_id LEFT JOIN regions r ON r.id = u.region_id' : 'LEFT JOIN users u ON u.id = h.rep_id'}
      WHERE TRUE ${filter1}
      GROUP BY 1,2,3`;

    // --- 2) ตัวชี้วัดจากงวดสัญญา ---
    const p2 = new Params();
    const filter2 = scopeClause(p2, filters);
    const asOfRef = p2.add(asOf);
    const perSql = `
      WITH ${PERIODS_CTE} ${filter2}
      )
      SELECT ${groupExpr.replace('h.', 'h.')} AS group_id,
             COUNT(*)::int AS total_periods,
             COUNT(invoice_id)::int AS invoiced_periods,
             COUNT(*) FILTER (WHERE invoice_id IS NULL AND period_start <= ${asOfRef}::date)::int AS due_not_invoiced_periods,
             COALESCE(SUM(estimated_amount) FILTER (WHERE invoice_id IS NULL AND period_start <= ${asOfRef}::date), 0) AS due_not_invoiced_amount,
             COALESCE(SUM(estimated_amount) FILTER (WHERE invoice_id IS NULL), 0) AS remaining_value
        FROM base
        JOIN contracts c ON c.id = base.contract_id
        JOIN hospitals h ON h.id = c.hospital_id
       GROUP BY 1`;

    const [inv, per] = await Promise.all([
      db.query(invSql, p1.values),
      db.query(perSql, p2.values),
    ]);

    const perMap = new Map(per.rows.map((r) => [String(r.group_id), r]));
    const rows = inv.rows.map((r) => {
      const pm = perMap.get(String(r.group_id)) || {};
      return {
        id: r.group_id,
        name: r.group_name,
        subLabel: r.sub_label,
        hospitalCount: num(r.hospital_count),
        invoiceCount: num(r.invoice_count),
        invoiceAmount: round2(r.invoice_amount),
        chequeAmount: round2(r.cheque_amount),
        awaitingAmount: round2(r.awaiting_amount),
        invoiceOverdueCount: num(r.overdue_count),
        invoiceOverdueAmount: round2(r.overdue_amount),
        totalPeriods: num(pm.total_periods),
        invoicedPeriods: num(pm.invoiced_periods),
        dueNotInvoicedPeriods: num(pm.due_not_invoiced_periods),
        dueNotInvoicedAmount: round2(pm.due_not_invoiced_amount),
        remainingValue: round2(pm.remaining_value),
        collectionRate: num(r.invoice_amount) > 0 ? round2((num(r.cheque_amount) / num(r.invoice_amount)) * 100) : 0,
      };
    });

    // โรงพยาบาล/ผู้แทนที่ยังไม่มีใบแจ้งหนี้เลย แต่มีงวดครบกำหนด -> ต้องแสดงด้วย
    for (const pr of per.rows) {
      const key = String(pr.group_id);
      if (!rows.some((r) => String(r.id) === key) && isRep) {
        rows.push({
          id: pr.group_id,
          name: 'ยังไม่มีใบแจ้งหนี้',
          subLabel: '',
          hospitalCount: 0,
          invoiceCount: 0,
          invoiceAmount: 0,
          chequeAmount: 0,
          awaitingAmount: 0,
          invoiceOverdueCount: 0,
          invoiceOverdueAmount: 0,
          totalPeriods: num(pr.total_periods),
          invoicedPeriods: num(pr.invoiced_periods),
          dueNotInvoicedPeriods: num(pr.due_not_invoiced_periods),
          dueNotInvoicedAmount: round2(pr.due_not_invoiced_amount),
          remainingValue: round2(pr.remaining_value),
          collectionRate: 0,
        });
      }
    }

    return rows;
  }

  async function overview(filters = {}) {
    const [periods, invoices, age, contracts, byRep, byHospital] = await Promise.all([
      periodMetrics(filters),
      invoiceMetrics(filters),
      aging(filters),
      contractSummary(filters),
      grouped(filters, 'rep'),
      grouped(filters, 'hospital'),
    ]);

    const collectionRate =
      invoices.invoiceAmount > 0 ? round2((invoices.chequeAmount / invoices.invoiceAmount) * 100) : 0;
    const deliveryRate =
      invoices.invoiceCount > 0 ? round2((invoices.deliveredCount / invoices.invoiceCount) * 100) : 0;

    return {
      asOf: filters.asOf || new Date().toISOString().slice(0, 10),
      filters,
      kpi: { ...periods, ...invoices, collectionRate, deliveryRate, ...contracts },
      aging: age,
      byRep: byRep.sort((a, b) => b.awaitingAmount - a.awaitingAmount),
      byHospital: byHospital.sort((a, b) => b.awaitingAmount - a.awaitingAmount),
    };
  }

  /** รายการงวดที่ถึงกำหนดแล้วแต่ยังไม่แจ้งหนี้ (ใช้ติดตามงาน) */
  async function uninvoicedPeriods(filters = {}) {
    const p = new Params();
    const filter = scopeClause(p, filters);
    const asOf = p.add(filters.asOf || new Date().toISOString().slice(0, 10));
    const sql = `
      WITH ${PERIODS_CTE} ${filter}
      )
      SELECT b.id, b.contract_id, b.period_no, b.period_start, b.period_end, b.due_date,
             b.estimated_amount, b.pricing_mode,
             (${asOf}::date - b.due_date) AS days_overdue,
             c.contract_no, c.contract_type,
             h.id AS hospital_id, h.name AS hospital_name, h.code AS hospital_code,
             h.rep_id, COALESCE(u.full_name, 'ยังไม่กำหนดผู้แทน') AS rep_name,
             r.name AS region_name
        FROM base b
        JOIN contracts c ON c.id = b.contract_id
        JOIN hospitals h ON h.id = c.hospital_id
        LEFT JOIN users u ON u.id = h.rep_id
        LEFT JOIN regions r ON r.id = h.region_id
       WHERE b.invoice_id IS NULL AND b.period_start <= ${asOf}
       ORDER BY b.due_date ASC
       LIMIT ${p.add(Number(filters.limit || 500))}`;
    const { rows } = await db.query(sql, p.values);
    return rows.map((r) => ({
      id: r.id,
      contractId: r.contract_id,
      contractNo: r.contract_no,
      contractType: r.contract_type,
      periodNo: r.period_no,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      dueDate: r.due_date,
      estimatedAmount: round2(r.estimated_amount),
      pricingMode: r.pricing_mode,
      daysOverdue: num(r.days_overdue),
      hospitalId: r.hospital_id,
      hospitalName: r.hospital_name,
      hospitalCode: r.hospital_code,
      repId: r.rep_id,
      repName: r.rep_name,
      regionName: r.region_name,
    }));
  }

  /** ใบแจ้งหนี้ที่ยังไม่ได้รับเช็ค เรียงตามอายุหนี้ */
  async function unpaidInvoices(filters = {}) {
    const p = new Params();
    const filter = scopeClause(p, filters);
    const sql = `
      SELECT v.id, v.invoice_no, v.issue_date, v.due_date, v.total_amount, v.outstanding_amount,
             v.days_overdue, v.payment_state, v.last_delivered_on,
             h.id AS hospital_id, h.name AS hospital_name,
             COALESCE(u.full_name, 'ยังไม่กำหนดผู้แทน') AS rep_name,
             c.contract_no
        FROM v_invoice_receivable v
        JOIN hospitals h ON h.id = v.hospital_id
        JOIN contracts c ON c.id = v.contract_id
        LEFT JOIN users u ON u.id = h.rep_id
       WHERE v.status <> 'CANCELLED' AND v.outstanding_amount > 0 ${filter}
       ORDER BY v.due_date ASC
       LIMIT ${p.add(Number(filters.limit || 200))}`;
    const { rows } = await db.query(sql, p.values);
    return rows.map((r) => ({
      id: r.id,
      invoiceNo: r.invoice_no,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      totalAmount: round2(r.total_amount),
      outstandingAmount: round2(r.outstanding_amount),
      daysOverdue: num(r.days_overdue),
      paymentState: r.payment_state,
      lastDeliveredOn: r.last_delivered_on,
      hospitalId: r.hospital_id,
      hospitalName: r.hospital_name,
      repName: r.rep_name,
      contractNo: r.contract_no,
    }));
  }

  /** ความครบถ้วนของการส่งใบแจ้งหนี้ แยกตามสัญญา */
  async function deliveryCoverage(filters = {}) {
    const p = new Params();
    const filter = scopeClause(p, filters);
    const sql = `
      SELECT c.id AS contract_id, c.contract_no, h.name AS hospital_name,
             COALESCE(u.full_name,'ยังไม่กำหนดผู้แทน') AS rep_name,
             COUNT(v.id)::int AS invoice_count,
             COUNT(v.last_delivered_on)::int AS delivered_count,
             (COUNT(v.id) - COUNT(v.last_delivered_on))::int AS undelivered_count
        FROM contracts c
        JOIN hospitals h ON h.id = c.hospital_id
        LEFT JOIN users u ON u.id = h.rep_id
        LEFT JOIN v_invoice_receivable v ON v.contract_id = c.id AND v.status <> 'CANCELLED'
       WHERE c.status <> 'CANCELLED' ${filter}
       GROUP BY 1,2,3,4
       ORDER BY undelivered_count DESC, invoice_count DESC`;
    const { rows } = await db.query(sql, p.values);
    return rows.map((r) => ({
      contractId: r.contract_id,
      contractNo: r.contract_no,
      hospitalName: r.hospital_name,
      repName: r.rep_name,
      invoiceCount: num(r.invoice_count),
      deliveredCount: num(r.delivered_count),
      undeliveredCount: num(r.undelivered_count),
    }));
  }

  return { overview, periodMetrics, invoiceMetrics, aging, contractSummary, grouped, uninvoicedPeriods, unpaidInvoices, deliveryCoverage };
}
