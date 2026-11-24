import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPeriods } from '../src/services/periods.js';

test('สัญญา 1 ปี ตัด 12 งวดรายเดือน (ตัวอย่างในโจทย์ ต.ค. 2569 - ก.ย. 2570)', () => {
  const periods = buildPeriods({
    startDate: '2026-10-01',
    endDate: '2027-09-30',
    billingCycle: 'MONTHLY',
    paymentTermDays: 30,
    pricingMode: 'FIXED',
    periodAmount: 30000,
  });
  assert.equal(periods.length, 12);
  assert.equal(periods[0].period_start, '2026-10-01');
  assert.equal(periods[0].period_end, '2026-10-31');
  assert.equal(periods[0].due_date, '2026-11-30');
  assert.equal(periods[11].period_start, '2027-09-01');
  assert.equal(periods[11].period_end, '2027-09-30');
  assert.equal(periods[0].expected_amount, 30000);
});

test('เริ่มกลางเดือน งวดแรกตัดถึงสิ้นเดือน', () => {
  const periods = buildPeriods({
    startDate: '2026-10-15',
    endDate: '2026-12-31',
    billingCycle: 'MONTHLY',
  });
  assert.equal(periods.length, 3);
  assert.deepEqual(
    periods.map((p) => [p.period_start, p.period_end]),
    [
      ['2026-10-15', '2026-10-31'],
      ['2026-11-01', '2026-11-30'],
      ['2026-12-01', '2026-12-31'],
    ],
  );
});

test('รอบจ่ายทุก 15 วัน', () => {
  const periods = buildPeriods({
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    billingCycle: 'EVERY_15_DAYS',
  });
  assert.equal(periods.length, 3);
  assert.deepEqual([periods[0].period_start, periods[0].period_end], ['2026-01-01', '2026-01-15']);
  assert.deepEqual([periods[1].period_start, periods[1].period_end], ['2026-01-16', '2026-01-30']);
  assert.deepEqual([periods[2].period_start, periods[2].period_end], ['2026-01-31', '2026-01-31']);
});

test('รอบจ่ายทุก 10 วัน', () => {
  const periods = buildPeriods({
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    billingCycle: 'EVERY_10_DAYS',
  });
  assert.equal(periods.length, 3);
  assert.equal(periods[2].period_end, '2026-02-28');
});

test('pay per use ไม่มียอดคงที่ต่องวด', () => {
  const periods = buildPeriods({
    startDate: '2026-01-01',
    endDate: '2026-02-28',
    billingCycle: 'MONTHLY',
    pricingMode: 'PAY_PER_USE',
    periodAmount: 1000,
  });
  assert.equal(periods.length, 2);
  assert.equal(periods[0].expected_amount, null);
});

test('วันครบกำหนด = สิ้นงวด + เครดิตเทอม', () => {
  const periods = buildPeriods({
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    billingCycle: 'MONTHLY',
    paymentTermDays: 45,
  });
  assert.equal(periods[0].due_date, '2026-05-15');
});
