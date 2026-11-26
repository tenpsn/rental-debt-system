import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export function authenticate(db) {
  return asyncHandler(async (req, _res, next) => {
    // รับ token จาก header เท่านั้น ไม่รับจาก URL เพราะ URL ถูกเก็บใน log และประวัติ browser
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw ApiError.unauthorized('Token ไม่ถูกต้องหรือหมดอายุ');
    }

    const { rows } = await db.query(
      `SELECT id, email, full_name, role, region_id, is_active, password_changed_at
         FROM users WHERE id = $1`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user || !user.is_active) throw ApiError.unauthorized('บัญชีถูกปิดการใช้งาน');
    // token ที่ออกก่อนเปลี่ยนรหัสผ่านครั้งล่าสุด ใช้ไม่ได้แล้ว
    if (user.password_changed_at && payload.iat < Math.floor(new Date(user.password_changed_at).getTime() / 1000)) {
      throw ApiError.unauthorized('รหัสผ่านถูกเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่');
    }
    req.user = user;
    next();
  });
}

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(ApiError.forbidden());
    }
    next();
  };
}

/** ผู้ใช้ระดับบริหารเห็นทุกพื้นที่ / ผู้แทนเห็นเฉพาะโรงพยาบาลที่ตัวเองดูแล */
export function isScopedRep(user) {
  return user.role === 'REP';
}

// หาผู้แทนที่ดูแลเอกสารแต่ละประเภท
const OWNER_QUERY = {
  HOSPITAL: 'SELECT h.rep_id, NULL::uuid AS received_by FROM hospitals h WHERE h.id = $1',
  CONTRACT: `SELECT h.rep_id, NULL::uuid AS received_by
               FROM contracts c JOIN hospitals h ON h.id = c.hospital_id WHERE c.id = $1`,
  INVOICE: `SELECT h.rep_id, NULL::uuid AS received_by
              FROM invoices i JOIN hospitals h ON h.id = i.hospital_id WHERE i.id = $1`,
  CHEQUE: `SELECT h.rep_id, ch.received_by
             FROM cheques ch JOIN hospitals h ON h.id = ch.hospital_id WHERE ch.id = $1`,
};

// ผู้แทนเปิดหรือแก้ได้เฉพาะเอกสารของโรงพยาบาลที่ตัวเองดูแล
// ถ้าไม่ใช่ของตัวเองให้ตอบว่าไม่พบ เพื่อไม่ให้รู้ว่ามีเอกสารนี้อยู่
export async function assertRepAccess(db, user, entityType, id) {
  if (!isScopedRep(user)) return;
  const query = OWNER_QUERY[entityType];
  if (!query) throw ApiError.forbidden();
  const { rows } = await db.query(query, [id]);
  const owner = rows[0];
  if (!owner || (owner.rep_id !== user.id && owner.received_by !== user.id)) {
    throw ApiError.notFound('ไม่พบข้อมูล');
  }
}
