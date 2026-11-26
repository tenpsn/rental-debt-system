import { z } from 'zod';
import { ApiError } from './errors.js';

/** ตรวจสอบข้อมูลด้วย zod แล้วคืนค่าที่ผ่านการแปลง type */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || '(root)',
      message: i.message,
    }));
    throw ApiError.validation('ข้อมูลไม่ถูกต้อง', details);
  }
  return result.data;
}

export const isoDate = /^\d{4}-\d{2}-\d{2}$/;

// วันที่ต้องอยู่ในรูปแบบที่ถูก และต้องมีอยู่จริงในปฏิทิน เช่น 30 กุมภาพันธ์ จะไม่ผ่าน
export const dateStr = z
  .string()
  .regex(isoDate, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && y >= 2000 && y <= 2100;
  }, 'วันที่ไม่มีอยู่จริง');

// จำนวนเงินสูงสุดที่ฐานข้อมูลเก็บได้ และต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง
const MAX_MONEY = 999_999_999_999.99;
const twoDecimals = (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const moneyBase = z.number().max(MAX_MONEY, 'จำนวนเงินมากเกินไป').refine(twoDecimals, 'จำนวนเงินมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง');
export const positiveMoney = moneyBase.refine((v) => v > 0, 'จำนวนเงินต้องมากกว่า 0');
export const nonNegativeMoney = moneyBase.refine((v) => v >= 0, 'จำนวนเงินต้องไม่ติดลบ');

// จำนวนรายการที่ขอได้ต่อครั้ง ไม่ให้ขอทั้งตารางในครั้งเดียว
export function clampLimit(value, fallback, max = 1000) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}
