// กันการเดารหัสผ่าน นับจำนวนครั้งที่ล็อกอินผิด แยกตามอีเมลและตาม IP
// เก็บในหน่วยความจำ เริ่มนับใหม่เมื่อรีสตาร์ทเซิร์ฟเวอร์
import { ApiError } from './errors.js';

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

const failures = new Map();

function entry(key, now) {
  const current = failures.get(key);
  if (!current || (current.lockedUntil < now && now - current.firstAt > WINDOW_MS)) {
    const fresh = { count: 0, firstAt: now, lockedUntil: 0 };
    failures.set(key, fresh);
    return fresh;
  }
  return current;
}

const keysFor = (email, ip) => [`email:${String(email).toLowerCase()}`, `ip:${ip}`];

// เรียกก่อนตรวจรหัสผ่าน ถ้ายังถูกล็อกอยู่จะตอบกลับทันที
export function assertNotLocked(email, ip, now = Date.now()) {
  for (const key of keysFor(email, ip)) {
    const e = failures.get(key);
    if (e && e.lockedUntil > now) {
      const minutes = Math.ceil((e.lockedUntil - now) / 60000);
      throw new ApiError(429, 'TOO_MANY_ATTEMPTS', `ใส่รหัสผ่านผิดหลายครั้งเกินไป กรุณาลองใหม่ในอีก ${minutes} นาที`);
    }
  }
}

// เรียกเมื่อล็อกอินผิด ครบจำนวนที่กำหนดจะล็อกไว้ชั่วคราว
export function recordFailure(email, ip, now = Date.now()) {
  const [emailKey, ipKey] = keysFor(email, ip);
  for (const [key, max] of [[emailKey, MAX_PER_EMAIL], [ipKey, MAX_PER_IP]]) {
    const e = entry(key, now);
    e.count += 1;
    if (e.count >= max) {
      e.lockedUntil = now + LOCK_MS;
      e.count = 0;
      e.firstAt = now;
    }
  }
}

// ล็อกอินสำเร็จ ล้างการนับของอีเมลนั้น
export function recordSuccess(email) {
  failures.delete(keysFor(email, '')[0]);
}

// ล้างรายการเก่าทิ้งเป็นระยะ ไม่ให้หน่วยความจำโตไปเรื่อย ๆ
setInterval(() => {
  const now = Date.now();
  for (const [key, e] of failures) {
    if (e.lockedUntil < now && now - e.firstAt > WINDOW_MS) failures.delete(key);
  }
}, WINDOW_MS).unref();
