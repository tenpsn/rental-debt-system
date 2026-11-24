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
    const header = req.get('authorization') || '';
    const [, headerToken] = header.split(' ');
    // อนุญาตแนบ token ทาง query เฉพาะการเปิดไฟล์ (download/inline)
    const token = headerToken || (req.method === 'GET' ? req.query.token : undefined);
    if (!token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw ApiError.unauthorized('Token ไม่ถูกต้องหรือหมดอายุ');
    }

    const { rows } = await db.query(
      `SELECT id, email, full_name, role, region_id, is_active
         FROM users WHERE id = $1`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user || !user.is_active) throw ApiError.unauthorized('บัญชีถูกปิดการใช้งาน');
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
