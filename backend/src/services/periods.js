/**
 * สร้างงวดการเรียกเก็บเงินจากช่วงสัญญา + รอบการจ่าย
 * - MONTHLY        : ตัดงวดตามเดือนปฏิทิน (งวดแรกเริ่มวันที่เริ่มสัญญา)
 * - EVERY_10_DAYS  : งวดละ 10 วัน
 * - EVERY_15_DAYS  : งวดละ 15 วัน
 */

import { ApiError } from '../lib/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CONTRACT_DAYS = 3660;

export function toDate(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmt(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function endOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

const CYCLE_DAYS = { EVERY_10_DAYS: 10, EVERY_15_DAYS: 15 };

/**
 * @returns {Array<{period_no:number, period_start:string, period_end:string, due_date:string, expected_amount:number|null}>}
 */
export function buildPeriods({
  startDate,
  endDate,
  billingCycle = 'MONTHLY',
  paymentTermDays = 30,
  pricingMode = 'FIXED',
  periodAmount = null,
}) {
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw ApiError.badRequest('วันที่เริ่มหรือวันที่สิ้นสุดสัญญาไม่ถูกต้อง');
  }
  if (end < start) throw ApiError.badRequest('วันที่สิ้นสุดสัญญาต้องไม่น้อยกว่าวันที่เริ่ม');
  // สัญญายาวสุด 10 ปี กันการสร้างงวดจำนวนมากเกินจนเครื่องช้า
  if (end.getTime() - start.getTime() > MAX_CONTRACT_DAYS * DAY_MS) {
    throw ApiError.badRequest('สัญญายาวได้ไม่เกิน 10 ปี');
  }

  const periods = [];
  let cursor = start;
  let no = 1;

  while (cursor <= end) {
    let periodEnd;
    if (billingCycle === 'MONTHLY') {
      periodEnd = endOfMonth(cursor);
    } else {
      const span = CYCLE_DAYS[billingCycle];
      if (!span) throw ApiError.badRequest('รอบการจ่ายไม่ถูกต้อง');
      periodEnd = addDays(cursor, span - 1);
    }
    if (periodEnd > end) periodEnd = end;

    const dueDate = addDays(periodEnd, Number(paymentTermDays || 0));
    periods.push({
      period_no: no,
      period_start: fmt(cursor),
      period_end: fmt(periodEnd),
      due_date: fmt(dueDate),
      expected_amount: pricingMode === 'PAY_PER_USE' ? null : Number(periodAmount ?? 0),
    });

    cursor = addDays(periodEnd, 1);
    no += 1;
  }

  return periods;
}

/** แทนที่งวดทั้งหมดของสัญญา (ใช้เมื่อแก้ไขช่วงสัญญา/รอบจ่าย) */
export async function regeneratePeriods(client, contract) {
  const periods = buildPeriods({
    startDate: contract.start_date,
    endDate: contract.end_date,
    billingCycle: contract.billing_cycle,
    paymentTermDays: contract.payment_term_days,
    pricingMode: contract.pricing_mode,
    periodAmount: contract.period_amount,
  });

  await client.query('DELETE FROM contract_periods WHERE contract_id = $1', [contract.id]);

  for (const p of periods) {
    await client.query(
      `INSERT INTO contract_periods (contract_id, period_no, period_start, period_end, due_date, expected_amount)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [contract.id, p.period_no, p.period_start, p.period_end, p.due_date, p.expected_amount],
    );
  }
  return periods.length;
}
