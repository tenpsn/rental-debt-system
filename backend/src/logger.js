import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.logDir, { recursive: true });

const fileStream = pino.destination({
  dest: path.join(config.logDir, 'app.log'),
  sync: false,
  mkdir: true,
});

const streams = [{ stream: fileStream }];
if (config.env !== 'test') {
  streams.push({
    stream:
      config.env === 'development'
        ? pino.transport({ target: 'pino-pretty', options: { translateTime: 'SYS:standard' } })
        : process.stdout,
  });
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (config.env === 'test' ? 'silent' : 'info'),
    base: { service: 'rental-debt-api', env: config.env },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.password'],
      censor: '***',
    },
  },
  pino.multistream(streams),
);

/** บันทึก log ระดับธุรกิจ (audit trail) ลงไฟล์ */
export function logEvent(event, data = {}) {
  logger.info({ event, ...data }, event);
}
