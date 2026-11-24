import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../../db/schema.sql');

export async function runMigration() {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigration()
    .then(() => {
      console.log(`สร้างโครงสร้างฐานข้อมูลเรียบร้อย: ${config.db.database}`);
      return pool.end();
    })
    .catch(async (err) => {
      console.error('migration failed:', err.message);
      await pool.end();
      process.exit(1);
    });
}
