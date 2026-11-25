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

export function createApp(db) {
  const app = express();

  app.set('trust proxy', true);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));

  // ---- request log ----
  app.use((req, res, next) => {
    const id = req.get('x-request-id') || crypto.randomUUID();
    req.id = id;
    const started = Date.now();
    res.setHeader('x-request-id', id);
    res.on('finish', () => {
      logger.info(
        {
          requestId: id,
          method: req.method,
          url: req.originalUrl,
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
        error: { code: 'DUPLICATE', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว', details: err.detail },
        requestId: req.id,
      });
    }
    logger.error({ err, requestId: req.id, url: req.originalUrl }, 'unhandled_error');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      requestId: req.id,
    });
  });

  return app;
}
