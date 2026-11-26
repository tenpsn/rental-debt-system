import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { signToken, authenticate } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { assertNotLocked, recordFailure, recordSuccess } from '../lib/login-guard.js';

// รหัสผ่านปลอมไว้ใช้ตรวจตอนไม่พบผู้ใช้ เวลาที่ใช้จะเท่ากับกรณีพบผู้ใช้
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginSchema = z.object({
  email: z.string().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร'),
});

export default function authRoutes(db) {
  const router = Router();

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const body = parse(loginSchema, req.body);
      assertNotLocked(body.email, req.ip);
      const { rows } = await db.query(
        `SELECT u.*, r.name AS region_name
           FROM users u LEFT JOIN regions r ON r.id = u.region_id
          WHERE lower(u.email) = lower($1)`,
        [body.email],
      );
      const user = rows[0];
      // ตรวจรหัสผ่านทุกครั้งแม้ไม่พบผู้ใช้ เวลาตอบกลับจะได้ไม่บอกว่ามีอีเมลนี้ในระบบหรือไม่
      const ok = await bcrypt.compare(body.password, user?.password_hash ?? DUMMY_HASH);
      if (!user || !user.is_active || !ok) {
        recordFailure(body.email, req.ip);
        throw ApiError.unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }
      recordSuccess(body.email);

      await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
      req.user = { id: user.id, email: user.email, role: user.role };
      await audit(db, req, { action: 'LOGIN', entityType: 'USER', entityId: user.id });

      res.json({
        token: signToken(user),
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          regionId: user.region_id,
          regionName: user.region_name,
        },
      });
    }),
  );

  router.get(
    '/me',
    authenticate(db),
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT u.id, u.email, u.full_name, u.role, u.region_id, u.phone, r.name AS region_name
           FROM users u LEFT JOIN regions r ON r.id = u.region_id WHERE u.id = $1`,
        [req.user.id],
      );
      const u = rows[0];
      res.json({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        regionId: u.region_id,
        regionName: u.region_name,
        phone: u.phone,
      });
    }),
  );

  router.post(
    '/change-password',
    authenticate(db),
    asyncHandler(async (req, res) => {
      const body = parse(changePasswordSchema, req.body);
      const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const ok = await bcrypt.compare(body.current_password, rows[0].password_hash);
      if (!ok) throw ApiError.badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง');
      const hash = await bcrypt.hash(body.new_password, 10);
      // บันทึกเวลาเปลี่ยนรหัส token เก่าทุกอันของผู้ใช้นี้จะใช้ไม่ได้ทันที
      const { rows: updated } = await db.query(
        `UPDATE users SET password_hash = $1, password_changed_at = date_trunc('second', now())
          WHERE id = $2 RETURNING id, email, role`,
        [hash, req.user.id],
      );
      await audit(db, req, { action: 'CHANGE_PASSWORD', entityType: 'USER', entityId: req.user.id });
      // ส่ง token ใหม่กลับไป เครื่องที่เปลี่ยนรหัสจะได้ใช้งานต่อได้โดยไม่ต้องล็อกอินใหม่
      res.json({ ok: true, token: signToken(updated[0]) });
    }),
  );

  return router;
}
