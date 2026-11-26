import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');

// ค่าเริ่มต้นไม่เชื่อ proxy เลย ถ้ามี Nginx อยู่เครื่องเดียวกันให้ตั้ง TRUST_PROXY=loopback
// ใส่เป็นตัวเลขได้ หมายถึงจำนวนชั้นของ proxy
function parseTrustProxy(value) {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

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
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT_DIR, 'uploads'),
  logDir: process.env.LOG_DIR || path.join(ROOT_DIR, 'logs'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  defaultPassword: process.env.DEFAULT_PASSWORD || 'ChangeMe123!',
};

const WEAK_SECRETS = new Set(['change-me-in-production', 'secret', 'changeme']);

// ไม่ยอมเปิดเซิร์ฟเวอร์ถ้ารหัสลับของ token ไม่ได้ตั้ง สั้นไป หรือยังเป็นค่าตัวอย่าง
// เพราะถ้ารหัสนี้หลุด คนอื่นจะปลอม token เป็นใครก็ได้
export function assertSecureConfig() {
  const secret = config.jwtSecret;
  if (!secret || secret.length < 32 || WEAK_SECRETS.has(secret)) {
    throw new Error(
      'JWT_SECRET ต้องตั้งใน .env และยาวอย่างน้อย 32 ตัวอักษร ห้ามใช้ค่าตัวอย่าง ' +
        'สร้างค่าใหม่ได้ด้วยคำสั่ง: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }
}
