import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { authorize } from '../middleware/auth.js';
import { createReportsService } from '../services/reports.js';

function filtersFrom(req) {
  const f = {
    regionId: req.query.region_id ? Number(req.query.region_id) : null,
    repId: req.query.rep_id || null,
    hospitalId: req.query.hospital_id || null,
    contractId: req.query.contract_id || null,
    dateFrom: req.query.date_from || null,
    dateTo: req.query.date_to || null,
    asOf: req.query.as_of || null,
  };
  // ผู้แทนเห็นเฉพาะพื้นที่ของตัวเอง
  if (req.user.role === 'REP') {
    f.repId = req.user.id;
    f.regionId = null;
  }
  return f;
}

export default function reportRoutes(db) {
  const router = Router();
  const reports = createReportsService(db);

  router.get('/overview', asyncHandler(async (req, res) => {
    res.json(await reports.overview(filtersFrom(req)));
  }));

  router.get('/aging', asyncHandler(async (req, res) => {
    res.json(await reports.aging(filtersFrom(req)));
  }));

  router.get('/by-rep', asyncHandler(async (req, res) => {
    res.json(await reports.grouped(filtersFrom(req), 'rep'));
  }));

  router.get('/by-hospital', asyncHandler(async (req, res) => {
    res.json(await reports.grouped(filtersFrom(req), 'hospital'));
  }));

  router.get('/uninvoiced-periods', asyncHandler(async (req, res) => {
    res.json(await reports.uninvoicedPeriods({ ...filtersFrom(req), limit: req.query.limit }));
  }));

  router.get('/unpaid-invoices', asyncHandler(async (req, res) => {
    res.json(await reports.unpaidInvoices({ ...filtersFrom(req), limit: req.query.limit }));
  }));

  router.get('/delivery-coverage', asyncHandler(async (req, res) => {
    res.json(await reports.deliveryCoverage(filtersFrom(req)));
  }));

  router.get(
    '/audit-logs',
    authorize('ADMIN', 'MANAGER'),
    asyncHandler(async (req, res) => {
      const params = [];
      const where = ['TRUE'];
      if (req.query.entity_type) {
        params.push(req.query.entity_type);
        where.push(`entity_type = $${params.length}`);
      }
      if (req.query.action) {
        params.push(req.query.action);
        where.push(`action = $${params.length}`);
      }
      if (req.query.search) {
        params.push(`%${req.query.search}%`);
        where.push(`(actor_email ILIKE $${params.length} OR entity_id ILIKE $${params.length})`);
      }
      params.push(Number(req.query.limit || 200));
      const { rows } = await db.query(
        `SELECT id, actor_email, action, entity_type, entity_id, payload, ip_address, created_at
           FROM audit_logs WHERE ${where.join(' AND ')}
          ORDER BY created_at DESC LIMIT $${params.length}`,
        params,
      );
      res.json(
        rows.map((r) => ({
          id: Number(r.id),
          actorEmail: r.actor_email,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          payload: r.payload,
          ipAddress: r.ip_address,
          createdAt: r.created_at,
        })),
      );
    }),
  );

  return router;
}
