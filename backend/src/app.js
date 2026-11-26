import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'node:crypto';
import { config } from './config.js';
import { logger } from './logger.js';
import { ApiError } from './lib/errors.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import masterRoutes from './routes/master.js';
import contractRoutes from './routes/contracts.js';
import invoiceRoutes from './routes/invoices.js';
import chequeRoutes from './routes/cheques.js';
import attachmentRoutes from './routes/attachments.js';
import reportRoutes from './routes/reports.js';

// ข้อความภาษาไทยเมื่อข้อมูลซ้ำ แยกตามข้อมูลที่ซ้ำ
const DUPLICATE_MESSAGES = {
  users_email_key: 'อีเมลนี้มีผู้ใช้แล้ว',
  contracts_contract_no_key: 'เลขที่สัญญานี้มีอยู่แล้ว',
  invoices_invoice_no_key: 'เลขที่ใบแจ้งหนี้นี้มีอยู่แล้ว',
  hospitals_code_key: 'รหัสโรงพยาบาลนี้มีอยู่แล้ว',
  regions_code_key: 'รหัสภาคนี้มีอยู่แล้ว',
  uq_cheque_no_bank: 'เช็คเลขที่นี้ของธนาคารนี้ถูกบันทึกไว้แล้ว',
  uq_allocation: 'ตัดชำระใบแจ้งหนี้ใบเดียวกันซ้ำในเช็คเดียวกันไม่ได้',
  uq_invoice_active_period: 'งวดนี้ออกใบแจ้งหนี้ไปแล้ว',
  uq_contract_period: 'งวดนี้มีอยู่ในสัญญาแล้ว',
};
const duplicateMessage = (constraint) => DUPLICATE_MESSAGES[constraint] ?? 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';

export function createApp(db) {
  const app = express();

  // เชื่อ IP จาก proxy เฉพาะที่ตั้งไว้ ถ้าเชื่อทุกตัว ใครก็ปลอม IP ในบันทึกการใช้งานได้
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));

  // ---- request log ----
  app.use((req, res, next) => {
    // รับรหัสคำขอจากภายนอกเฉพาะรูปแบบที่ปลอดภัย ไม่อย่างนั้นสร้างใหม่
    const incomingId = req.get('x-request-id');
    const id = incomingId && /^[A-Za-z0-9-]{1,64}$/.test(incomingId) ? incomingId : crypto.randomUUID();
    req.id = id;
    const started = Date.now();
    res.setHeader('x-request-id', id);
    res.on('finish', () => {
      logger.info(
        {
          requestId: id,
          method: req.method,
          // ตัดค่า token ออกจาก URL ก่อนเขียน log เผื่อมีคนแนบมา
          url: req.originalUrl.replace(/([?&]token=)[^&]*/gi, '$1[removed]'),
          status: res.statusCode,
          durationMs: Date.now() - started,
          userId: req.user?.id,
          ip: req.ip,
        },
        'http',
      );
    });
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // ---- routes ----
  app.use('/api/auth', authRoutes(db));

  const protectedApi = express.Router();
  protectedApi.use(authenticate(db));
  protectedApi.use('/master', masterRoutes(db));
  protectedApi.use('/contracts', contractRoutes(db));
  protectedApi.use('/invoices', invoiceRoutes(db));
  protectedApi.use('/cheques', chequeRoutes(db));
  protectedApi.use('/attachments', attachmentRoutes(db));
  protectedApi.use('/reports', reportRoutes(db));
  app.use('/api', protectedApi);

  // ---- 404 + error handler ----
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'ไม่พบ API นี้' } }));

  app.use((err, req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({
        error: { code: err.code, message: err.message, details: err.details },
        requestId: req.id,
      });
    }
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: { code: 'FILE_TOO_LARGE', message: `ไฟล์ใหญ่เกิน ${config.maxUploadMb} MB` },
        requestId: req.id,
      });
    }
    // unique violation
    if (err?.code === '23505') {
      return res.status(409).json({
        // ไม่ส่งรายละเอียดจากฐานข้อมูลกลับไป เพราะจะเห็นชื่อคอลัมน์และค่าในระบบ
        error: { code: 'DUPLICATE', message: duplicateMessage(err.constraint) },
        requestId: req.id,
      });
    }
    // ข้อมูลที่ส่งมาผิดรูปแบบจนฐานข้อมูลรับไม่ได้ ตอบว่าข้อมูลไม่ถูกต้อง แทนการตอบว่าระบบขัดข้อง
    const BAD_INPUT_CODES = { '22P02': 'รูปแบบข้อมูลไม่ถูกต้อง', '22007': 'วันที่ไม่ถูกต้อง', '22008': 'วันที่ไม่ถูกต้อง', '22003': 'ตัวเลขมากเกินไป', '23514': 'ข้อมูลไม่ผ่านเงื่อนไขของระบบ', '23503': 'ข้อมูลที่อ้างถึงไม่มีอยู่ในระบบ' };
    if (BAD_INPUT_CODES[err?.code]) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: BAD_INPUT_CODES[err.code] },
        requestId: req.id,
      });
    }
    // ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'รูปแบบข้อมูลไม่ถูกต้อง' }, requestId: req.id });
    }
    logger.error({ err, requestId: req.id, url: req.originalUrl }, 'unhandled_error');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      requestId: req.id,
    });
  });

  return app;
}
