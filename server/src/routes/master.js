import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { authorize } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { config } from '../config.js';

const regionSchema = z.object({ code: z.string().min(1), name: z.string().min(1) });

const hospitalSchema = z.object({
  code: z.string().min(1, 'กรุณากรอกรหัสโรงพยาบาล'),
  name: z.string().min(1, 'กรุณากรอกชื่อโรงพยาบาล'),
  hospitalType: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  regionId: z.number().int().optional().nullable(),
  repId: z.string().uuid().optional().nullable(),
  address: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  contactEmail: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const userSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'REP', 'ACCOUNTING']),
  regionId: z.number().int().optional().nullable(),
  phone: z.string().optional().nullable(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
});

export default function masterRoutes(db) {
  const router = Router();

  // ---------- regions ----------
  router.get(
    '/regions',
    asyncHandler(async (_req, res) => {
      const { rows } = await db.query(
        `SELECT r.id, r.code, r.name,
                (SELECT count(*) FROM hospitals h WHERE h.region_id = r.id AND h.is_active)::int AS hospital_count
           FROM regions r ORDER BY r.id`,
      );
      res.json(rows.map((r) => ({ id: r.id, code: r.code, name: r.name, hospitalCount: r.hospital_count })));
    }),
  );

  router.post(
    '/regions',
    authorize('ADMIN'),
    asyncHandler(async (req, res) => {
      const b = parse(regionSchema, req.body);
      const { rows } = await db.query('INSERT INTO regions (code, name) VALUES ($1,$2) RETURNING *', [b.code, b.name]);
      await audit(db, req, { action: 'CREATE', entityType: 'REGION', entityId: rows[0].id, payload: b });
      res.status(201).json(rows[0]);
    }),
  );

  // ---------- hospitals ----------
  router.get(
    '/hospitals',
    asyncHandler(async (req, res) => {
      const params = [];
      const where = ['TRUE'];
      if (req.user.role === 'REP') {
        params.push(req.user.id);
        where.push(`h.rep_id = $${params.length}`);
      } else if (req.query.rep_id) {
        params.push(req.query.rep_id);
        where.push(`h.rep_id = $${params.length}`);
      }
      if (req.query.region_id) {
        params.push(Number(req.query.region_id));
        where.push(`h.region_id = $${params.length}`);
      }
      if (req.query.search) {
        params.push(`%${req.query.search}%`);
        where.push(`(h.name ILIKE $${params.length} OR h.code ILIKE $${params.length})`);
      }
      const { rows } = await db.query(
        `SELECT h.*, r.name AS region_name, u.full_name AS rep_name,
                (SELECT count(*) FROM contracts c WHERE c.hospital_id = h.id AND c.status = 'ACTIVE')::int AS active_contracts
           FROM hospitals h
           LEFT JOIN regions r ON r.id = h.region_id
           LEFT JOIN users u ON u.id = h.rep_id
          WHERE ${where.join(' AND ')}
          ORDER BY h.name`,
        params,
      );
      res.json(
        rows.map((h) => ({
          id: h.id,
          code: h.code,
          name: h.name,
          hospitalType: h.hospital_type,
          province: h.province,
          regionId: h.region_id,
          regionName: h.region_name,
          repId: h.rep_id,
          repName: h.rep_name,
          address: h.address,
          contactName: h.contact_name,
          contactPhone: h.contact_phone,
          contactEmail: h.contact_email,
          isActive: h.is_active,
          activeContracts: h.active_contracts,
        })),
      );
    }),
  );

  router.post(
    '/hospitals',
    authorize('ADMIN', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const b = parse(hospitalSchema, req.body);
      const { rows } = await db.query(
        `INSERT INTO hospitals (code, name, hospital_type, province, region_id, rep_id, address, contact_name, contact_phone, contact_email)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [b.code, b.name, b.hospitalType, b.province, b.regionId, b.repId, b.address, b.contactName, b.contactPhone, b.contactEmail],
      );
      await audit(db, req, { action: 'CREATE', entityType: 'HOSPITAL', entityId: rows[0].id, payload: b });
      res.status(201).json({ id: rows[0].id });
    }),
  );

  router.patch(
    '/hospitals/:id',
    authorize('ADMIN', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const b = parse(hospitalSchema.partial(), req.body);
      const map = {
        code: 'code', name: 'name', hospitalType: 'hospital_type', province: 'province',
        regionId: 'region_id', repId: 'rep_id', address: 'address', contactName: 'contact_name',
        contactPhone: 'contact_phone', contactEmail: 'contact_email', isActive: 'is_active',
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
      const { rowCount } = await db.query(`UPDATE hospitals SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      if (!rowCount) throw ApiError.notFound('ไม่พบโรงพยาบาล');
      await audit(db, req, { action: 'UPDATE', entityType: 'HOSPITAL', entityId: req.params.id, payload: b });
      res.json({ ok: true });
    }),
  );

  // ---------- users ----------
  router.get(
    '/users',
    asyncHandler(async (_req, res) => {
      const { rows } = await db.query(
        `SELECT u.id, u.email, u.full_name, u.role, u.region_id, u.phone, u.is_active, u.last_login_at,
                r.name AS region_name,
                (SELECT count(*) FROM hospitals h WHERE h.rep_id = u.id)::int AS hospital_count
           FROM users u LEFT JOIN regions r ON r.id = u.region_id
          ORDER BY u.role, u.full_name`,
      );
      res.json(
        rows.map((u) => ({
          id: u.id,
          email: u.email,
          fullName: u.full_name,
          role: u.role,
          regionId: u.region_id,
          regionName: u.region_name,
          phone: u.phone,
          isActive: u.is_active,
          lastLoginAt: u.last_login_at,
          hospitalCount: u.hospital_count,
        })),
      );
    }),
  );

  router.post(
    '/users',
    authorize('ADMIN'),
    asyncHandler(async (req, res) => {
      const b = parse(userSchema, req.body);
      const hash = await bcrypt.hash(b.password || config.defaultPassword, 10);
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, full_name, role, region_id, phone)
         VALUES (lower($1),$2,$3,$4,$5,$6) RETURNING id`,
        [b.email, hash, b.fullName, b.role, b.regionId, b.phone],
      );
      await audit(db, req, { action: 'CREATE', entityType: 'USER', entityId: rows[0].id, payload: { ...b, password: undefined } });
      res.status(201).json({ id: rows[0].id });
    }),
  );

  router.patch(
    '/users/:id',
    authorize('ADMIN'),
    asyncHandler(async (req, res) => {
      const b = parse(userSchema.partial(), req.body);
      const sets = [];
      const params = [];
      const map = { email: 'email', fullName: 'full_name', role: 'role', regionId: 'region_id', phone: 'phone', isActive: 'is_active' };
      for (const [key, col] of Object.entries(map)) {
        if (b[key] !== undefined) {
          params.push(b[key]);
          sets.push(`${col} = $${params.length}`);
        }
      }
      if (b.password) {
        params.push(await bcrypt.hash(b.password, 10));
        sets.push(`password_hash = $${params.length}`);
      }
      if (!sets.length) throw ApiError.badRequest('ไม่มีข้อมูลที่จะแก้ไข');
      params.push(req.params.id);
      const { rowCount } = await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      if (!rowCount) throw ApiError.notFound('ไม่พบผู้ใช้');
      await audit(db, req, { action: 'UPDATE', entityType: 'USER', entityId: req.params.id, payload: { ...b, password: undefined } });
      res.json({ ok: true });
    }),
  );

  return router;
}
