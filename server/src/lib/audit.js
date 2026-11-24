import { logEvent } from '../logger.js';

/**
 * บันทึก audit log ลงฐานข้อมูล + ไฟล์ log
 * เรียกหลังทำงานสำเร็จทุกครั้งที่มีการเปลี่ยนแปลงข้อมูล
 */
export async function audit(db, req, { action, entityType, entityId = null, payload = null }) {
  const actor = req.user || null;
  try {
    await db.query(
      `INSERT INTO audit_logs (actor_id, actor_email, action, entity_type, entity_id, payload, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        actor?.id ?? null,
        actor?.email ?? null,
        action,
        entityType,
        entityId ? String(entityId) : null,
        payload ? JSON.stringify(payload) : null,
        req.ip ?? null,
        req.get('user-agent') ?? null,
      ],
    );
  } catch (err) {
    // audit ต้องไม่ทำให้ business flow ล้มเหลว แต่ต้องมีร่องรอยในไฟล์ log
    logEvent('audit.write_failed', { action, entityType, entityId, error: err.message });
  }
  logEvent('audit', {
    action,
    entityType,
    entityId,
    actor: actor?.email ?? 'anonymous',
    payload,
  });
}
