import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { authorize } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { config } from '../config.js';

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp']);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(config.uploadDir, String(req.body.entityType || 'misc').toLowerCase());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || (file.mimetype === 'application/pdf' ? '.pdf' : '.bin');
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(ApiError.badRequest('รับเฉพาะไฟล์ PDF หรือรูปภาพ (JPG/PNG/TIFF)'));
    }
    cb(null, true);
  },
});

export default function attachmentRoutes(db) {
  const router = Router();

  router.post(
    '/',
    authorize('ADMIN', 'ACCOUNTING', 'MANAGER', 'REP'),
    (req, _res, next) => upload.single('file')(req, _res, next),
    asyncHandler(async (req, res) => {
      if (!req.file) throw ApiError.badRequest('ไม่พบไฟล์ที่อัปโหลด');
      const { entityType, entityId } = req.body;
      if (!['INVOICE', 'CHEQUE', 'CONTRACT', 'HOSPITAL'].includes(entityType)) {
        throw ApiError.badRequest('ประเภทเอกสารไม่ถูกต้อง');
      }

      const table = { INVOICE: 'invoices', CHEQUE: 'cheques', CONTRACT: 'contracts', HOSPITAL: 'hospitals' }[entityType];
      const exists = await db.query(`SELECT 1 FROM ${table} WHERE id = $1`, [entityId]);
      if (!exists.rowCount) throw ApiError.notFound('ไม่พบเอกสารอ้างอิง');

      const relativePath = path.relative(config.uploadDir, req.file.path);
      // เก็บชื่อไฟล์แบบ relative ต่อ uploadDir
      const original = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

      const { rows } = await db.query(
        `INSERT INTO attachments (entity_type, entity_id, file_name, stored_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
        [entityType, entityId, original, relativePath, req.file.mimetype, req.file.size, req.user.id],
      );

      await audit(db, req, {
        action: 'UPLOAD',
        entityType: 'ATTACHMENT',
        entityId: rows[0].id,
        payload: { entityType, entityId, fileName: original, size: req.file.size },
      });
      res.status(201).json({ id: rows[0].id, fileName: original, sizeBytes: req.file.size });
    }),
  );

  router.get(
    '/:id/download',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
      const file = rows[0];
      if (!file) throw ApiError.notFound('ไม่พบไฟล์');
      const full = path.join(config.uploadDir, file.stored_name);
      if (!fs.existsSync(full)) throw ApiError.notFound('ไม่พบไฟล์บนเซิร์ฟเวอร์');
      res.setHeader('Content-Type', file.mime_type);
      res.setHeader(
        'Content-Disposition',
        `${req.query.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      );
      fs.createReadStream(full).pipe(res);
    }),
  );

  router.delete(
    '/:id',
    authorize('ADMIN', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const { rows } = await db.query('DELETE FROM attachments WHERE id = $1 RETURNING stored_name', [req.params.id]);
      if (!rows.length) throw ApiError.notFound('ไม่พบไฟล์');
      const full = path.join(config.uploadDir, rows[0].stored_name);
      if (fs.existsSync(full)) fs.unlinkSync(full);
      await audit(db, req, { action: 'DELETE', entityType: 'ATTACHMENT', entityId: req.params.id });
      res.json({ ok: true });
    }),
  );

  return router;
}
