import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'rental_debt',
    max: Number(process.env.DB_POOL_MAX || 10),
  },
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT_DIR, 'uploads'),
  logDir: process.env.LOG_DIR || path.join(ROOT_DIR, 'logs'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  defaultPassword: process.env.DEFAULT_PASSWORD || 'ChangeMe123!',
};
