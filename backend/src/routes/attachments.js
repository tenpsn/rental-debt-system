import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { assertRepAccess, authorize } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { config } from '../config.js';

// ชนิดไฟล์ที่รับ กับนามสกุลที่จะใช้ตั้งชื่อไฟล์
const EXT_BY_MIME = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/tiff': '.tif',
  'image/webp': '.webp',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ประเภทเอกสาร กับชื่อตารางและชื่อโฟลเดอร์ที่ใช้เก็บไฟล์
const ENTITIES = {
  INVOICE: { table: 'invoices', folder: 'invoice' },
  CHEQUE: { table: 'cheques', folder: 'cheque' },
  CONTRACT: { table: 'contracts', folder: 'contract' },
  HOSPITAL: { table: 'hospitals', folder: 'hospital' },
};

const storage = multer.diskStorage({
  // โฟลเดอร์มาจากรายการที่กำหนดไว้เท่านั้น ไม่ใช้ค่าที่ผู้ใช้ส่งมาตรง ๆ
  destination: (req, _file, cb) => {
    const entity = ENTITIES[req.body.entityType];
    if (!entity) return cb(ApiError.badRequest('ประเภทเอกสารไม่ถูกต้อง'));
    const dir = path.join(config.uploadDir, entity.folder);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  // ตั้งชื่อไฟล์ใหม่ และใช้นามสกุลตามชนิดไฟล์ที่ตรวจแล้ว ไม่ใช้นามสกุลจากชื่อไฟล์เดิม
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${EXT_BY_MIME[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    // ต้องส่งประเภทเอกสารมาก่อนไฟล์ และต้องเป็นประเภทที่รู้จัก
    if (!ENTITIES[req.body.entityType]) {
      return cb(ApiError.badRequest('ประเภทเอกสารไม่ถูกต้อง'));
    }
    if (!EXT_BY_MIME[file.mimetype]) {
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
      try {
        const entity = ENTITIES[entityType];
        if (!entity) throw ApiError.badRequest('ประเภทเอกสารไม่ถูกต้อง');
        if (!UUID_PATTERN.test(String(entityId ?? ''))) throw ApiError.badRequest('รหัสเอกสารไม่ถูกต้อง');
        const exists = await db.query(`SELECT 1 FROM ${entity.table} WHERE id = $1`, [entityId]);
        if (!exists.rowCount) throw ApiError.notFound('ไม่พบเอกสารอ้างอิง');
        await assertRepAccess(db, req.user, entityType, entityId);
      } catch (err) {
        // ตรวจไม่ผ่านด้วยเหตุผลใดก็ตาม ให้ลบไฟล์ที่เพิ่งอัปโหลดทิ้ง
        fs.rmSync(req.file.path, { force: true });
        throw err;
      }

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
      await assertRepAccess(db, req.user, file.entity_type, file.entity_id);
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
      const { rows } = await db.query('DELETE FROM attachments WHERE id = $1 RETURNING stored_name, file_name, entity_type, entity_id, size_bytes', [req.params.id]);
      if (!rows.length) throw ApiError.notFound('ไม่พบไฟล์');
      const full = path.join(config.uploadDir, rows[0].stored_name);
      if (fs.existsSync(full)) fs.unlinkSync(full);
      // เก็บว่าลบไฟล์อะไร ของเอกสารไหน ไว้ตรวจย้อนหลัง
      await audit(db, req, {
        action: 'DELETE',
        entityType: 'ATTACHMENT',
        entityId: req.params.id,
        payload: { fileName: rows[0].file_name, sizeBytes: rows[0].size_bytes, entityType: rows[0].entity_type, entityId: rows[0].entity_id },
      });
      res.json({ ok: true });
    }),
  );

  return router;
}
