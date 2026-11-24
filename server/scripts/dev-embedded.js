/**
 * โหมดพัฒนาแบบไม่ต้องติดตั้ง PostgreSQL เอง
 * - ดาวน์โหลด/รัน PostgreSQL แบบฝังในโปรเจกต์ (embedded-postgres)
 * - สร้าง schema ให้อัตโนมัติ แล้วสตาร์ท API
 *
 * ใช้: npm run dev:embedded
 * (ข้อมูลจะถูกเก็บที่ ./.pgdata และพอร์ต 55433)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

process.env.DB_PORT = process.env.DB_PORT || '55433';
process.env.DB_NAME = process.env.DB_NAME || 'rental_debt';
process.env.DB_USER = process.env.DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';

const pg = new EmbeddedPostgres({
  databaseDir: process.env.PGDATA_DIR || path.join(root, '.pgdata'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C.utf8'],
});

await pg.initialise();
await pg.start();
await pg.createDatabase(process.env.DB_NAME).catch(() => {});

const { pool, db } = await import('../src/db.js');
await pool.query(fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8'));
console.log(`PostgreSQL (embedded) พร้อมใช้งาน พอร์ต ${process.env.DB_PORT}`);

const { createApp } = await import('../src/app.js');
const app = createApp(db);
app.listen(Number(process.env.PORT || 3000), () => {
  console.log(`API: http://localhost:${process.env.PORT || 3000}/api`);
});

process.on('SIGINT', async () => {
  await pg.stop();
  process.exit(0);
});
