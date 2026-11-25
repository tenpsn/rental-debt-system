import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { signToken, authenticate } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

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
      const { rows } = await db.query(
        `SELECT u.*, r.name AS region_name
           FROM users u LEFT JOIN regions r ON r.id = u.region_id
          WHERE lower(u.email) = lower($1)`,
        [body.email],
      );
      const user = rows[0];
      if (!user || !user.is_active) throw ApiError.unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

      const ok = await bcrypt.compare(body.password, user.password_hash);
      if (!ok) throw ApiError.unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

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
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
      await audit(db, req, { action: 'CHANGE_PASSWORD', entityType: 'USER', entityId: req.user.id });
      res.json({ ok: true });
    }),
  );

  return router;
}
