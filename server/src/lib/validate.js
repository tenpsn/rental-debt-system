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
