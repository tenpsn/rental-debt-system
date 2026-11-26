import pg from 'pg';
import { config } from './config.js';
import { BUSINESS_TIME_ZONE } from './lib/dates.js';

// numeric/decimal -> number, date -> 'YYYY-MM-DD' string (อ่านง่ายบน frontend)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);

export function createPool(overrides = {}) {
  // ให้ฐานข้อมูลคิดวันที่ปัจจุบันเป็นเวลาประเทศไทยเสมอ ไม่ขึ้นกับการตั้งค่าของ server
  const pool = new pg.Pool({ options: `-c timezone=${BUSINESS_TIME_ZONE}`, ...config.db, ...overrides });
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('Unexpected PG pool error', err);
  });
  return pool;
}

export function createDb(pool) {
  const query = (text, params) => pool.query(text, params);

  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return { pool, query, tx };
}

export const pool = createPool();
export const db = createDb(pool);
