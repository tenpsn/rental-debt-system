import pg from 'pg';
import { config } from './config.js';

// numeric/decimal -> number, date -> 'YYYY-MM-DD' string (อ่านง่ายบน frontend)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);

export function createPool(overrides = {}) {
  const pool = new pg.Pool({ ...config.db, ...overrides });
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
