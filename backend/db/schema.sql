-- =============================================================================
-- ระบบบันทึกและติดตามหนี้จากการเช่าเครื่อง (Rental Debt Tracking System)
-- PostgreSQL schema  —  version 1.0
-- ใช้งาน: psql -U <user> -d rental_debt -f backend/db/schema.sql
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- running number สำหรับเลขที่ใบแจ้งหนี้
CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1;

-- ---------------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'REP', 'ACCOUNTING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contract_type AS ENUM ('LEASE', 'PURCHASE_ORDER', 'SHORT_TERM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE billing_cycle AS ENUM ('MONTHLY', 'EVERY_10_DAYS', 'EVERY_15_DAYS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pricing_mode AS ENUM ('FIXED', 'PAY_PER_USE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_method AS ENUM (
    'COURIER_TO_REP',      -- บริษัทส่งผ่านขนส่งไปให้ผู้แทนพื้นที่
    'COURIER_TO_HOSPITAL', -- บริษัทส่งผ่านขนส่งไปที่โรงพยาบาลโดยตรง
    'HAND_TO_REP',         -- ผู้แทนมารับที่บริษัท
    'HAND_TO_HOSPITAL',    -- พนักงานนำไปส่งที่โรงพยาบาล
    'EMAIL',               -- ส่งทางอีเมล
    'POST'                 -- ไปรษณีย์
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM ('IN_TRANSIT', 'DELIVERED', 'ACKNOWLEDGED', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cheque_status AS ENUM ('RECEIVED', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cheque_delivery AS ENUM (
    'REP_PICKUP',       -- ผู้แทนเข้าไปรับที่โรงพยาบาล
    'SENT_TO_COMPANY',  -- โรงพยาบาลส่งมาที่บริษัท
    'REP_TO_COMPANY',   -- ผู้แทนนำเช็คเข้ามาที่บริษัท
    'HAND_DELIVERED'    -- นำส่งด้วยตนเอง
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- ข้อมูลพื้นฐาน
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regions (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  role           user_role NOT NULL DEFAULT 'REP',
  region_id      INTEGER REFERENCES regions(id) ON DELETE SET NULL,
  phone          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- เวลาที่เปลี่ยนรหัสผ่านล่าสุด token ที่ออกก่อนเวลานี้จะใช้ไม่ได้
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS hospitals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,          -- รหัสโรงพยาบาล / รหัสหน่วยงาน
  name           TEXT NOT NULL,
  hospital_type  TEXT,                          -- รพ.ศูนย์ / รพ.ทั่วไป / รพช. ฯลฯ
  province       TEXT,
  region_id      INTEGER REFERENCES regions(id) ON DELETE SET NULL,
  rep_id         UUID REFERENCES users(id) ON DELETE SET NULL,   -- ผู้แทนที่ดูแล
  address        TEXT,
  contact_name   TEXT,
  contact_phone  TEXT,
  contact_email  TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hospitals_region ON hospitals(region_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_rep ON hospitals(rep_id);

-- ---------------------------------------------------------------------------
-- สัญญาเช่า / ใบสั่งจ้าง
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_no         TEXT NOT NULL UNIQUE,
  hospital_id         UUID NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
  contract_type       contract_type NOT NULL DEFAULT 'LEASE',
  title               TEXT,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  billing_cycle       billing_cycle NOT NULL DEFAULT 'MONTHLY',
  pricing_mode        pricing_mode NOT NULL DEFAULT 'FIXED',
  period_amount       NUMERIC(14,2),            -- ค่าเช่าต่องวด (แบบ FIXED)
  unit_price          NUMERIC(14,2),            -- ราคาต่อหน่วย (แบบ PAY_PER_USE เช่น บาท/ภาพ)
  unit_name           TEXT,                     -- ชื่อหน่วย เช่น 'ภาพ', 'ครั้ง', 'รายการ'
  payment_term_days   INTEGER NOT NULL DEFAULT 30,
  vat_rate            NUMERIC(5,2) NOT NULL DEFAULT 7,
  status              contract_status NOT NULL DEFAULT 'ACTIVE',
  renewal_of_id       UUID REFERENCES contracts(id) ON DELETE SET NULL,  -- สัญญาต่อเนื่องปีต่อปี
  note                TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contract_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_fixed_amount CHECK (pricing_mode <> 'FIXED' OR period_amount IS NOT NULL),
  CONSTRAINT chk_ppu_unit CHECK (pricing_mode <> 'PAY_PER_USE' OR unit_price IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_contracts_hospital ON contracts(hospital_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- เครื่องที่ให้เช่า (1 สัญญามีได้หลายเครื่อง)
CREATE TABLE IF NOT EXISTS equipment (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  model        TEXT,
  serial_no    TEXT,
  qty          INTEGER NOT NULL DEFAULT 1,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_equipment_contract ON equipment(contract_id);

-- งวดการเรียกเก็บ (สร้างอัตโนมัติจากช่วงสัญญา + รอบการจ่าย)
CREATE TABLE IF NOT EXISTS contract_periods (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  period_no        INTEGER NOT NULL,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  due_date         DATE NOT NULL,               -- วันครบกำหนดชำระ
  expected_amount  NUMERIC(14,2),               -- NULL = pay per use (ทราบยอดตอนออกใบแจ้งหนี้)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_contract_period UNIQUE (contract_id, period_no),
  CONSTRAINT chk_period_dates CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_periods_contract ON contract_periods(contract_id);
CREATE INDEX IF NOT EXISTS idx_periods_due ON contract_periods(due_date);

-- ---------------------------------------------------------------------------
-- ใบแจ้งหนี้
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no    TEXT NOT NULL UNIQUE,
  hospital_id   UUID NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
  contract_id   UUID NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
  period_id     UUID REFERENCES contract_periods(id) ON DELETE SET NULL,
  issue_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date      DATE NOT NULL,
  amount        NUMERIC(14,2) NOT NULL,          -- ยอดก่อน VAT
  vat_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount  NUMERIC(14,2) NOT NULL,          -- ยอดรวม
  usage_qty     NUMERIC(14,2),                   -- จำนวนหน่วย (pay per use) เช่น จำนวนภาพ
  status        invoice_status NOT NULL DEFAULT 'ISSUED',
  note          TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_invoice_amount CHECK (amount >= 0 AND total_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_hospital ON invoices(hospital_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issue ON invoices(issue_date);
-- 1 งวด ออกใบแจ้งหนี้ได้ 1 ใบ (ยกเลิกแล้วออกใหม่ได้)
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_active_period
  ON invoices(period_id) WHERE status <> 'CANCELLED' AND period_id IS NOT NULL;

-- ประวัติการจัดส่งใบแจ้งหนี้ (สอบย้อนหลังได้ว่า ส่งเมื่อไร วิธีใด ถึงใคร)
CREATE TABLE IF NOT EXISTS invoice_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  delivered_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  method          delivery_method NOT NULL,
  status          delivery_status NOT NULL DEFAULT 'DELIVERED',
  recipient_type  TEXT NOT NULL DEFAULT 'REP',   -- REP | HOSPITAL | OTHER
  recipient_name  TEXT,
  courier_name    TEXT,
  tracking_no     TEXT,
  note            TEXT,
  recorded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_invoice ON invoice_deliveries(invoice_id);

-- ---------------------------------------------------------------------------
-- เช็ค และการตัดชำระ
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cheques (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cheque_no              TEXT NOT NULL,
  bank_name              TEXT NOT NULL,
  bank_branch            TEXT,
  amount                 NUMERIC(14,2) NOT NULL,
  cheque_date            DATE NOT NULL,           -- วันที่หน้าเช็ค
  received_date          DATE NOT NULL,           -- วันที่รับเช็ค
  received_by            UUID REFERENCES users(id) ON DELETE SET NULL,   -- ผู้แทนผู้รับ
  hospital_id            UUID NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
  delivery_method        cheque_delivery NOT NULL DEFAULT 'REP_PICKUP',
  company_received_date  DATE,                    -- วันที่เช็คเข้าถึงบริษัท
  status                 cheque_status NOT NULL DEFAULT 'RECEIVED',
  note                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_cheque_amount CHECK (amount > 0),
  CONSTRAINT uq_cheque_no_bank UNIQUE (bank_name, cheque_no)
);
CREATE INDEX IF NOT EXISTS idx_cheques_hospital ON cheques(hospital_id);
CREATE INDEX IF NOT EXISTS idx_cheques_received ON cheques(received_date);

CREATE TABLE IF NOT EXISTS cheque_allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cheque_id   UUID NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount      NUMERIC(14,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_allocation UNIQUE (cheque_id, invoice_id),
  CONSTRAINT chk_allocation_amount CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_alloc_invoice ON cheque_allocations(invoice_id);

-- ---------------------------------------------------------------------------
-- ไฟล์แนบ (PDF ใบแจ้งหนี้ / scan เช็ค)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('INVOICE', 'CHEQUE', 'CONTRACT', 'HOSPITAL')),
  entity_id    UUID NOT NULL,
  file_name    TEXT NOT NULL,        -- ชื่อไฟล์เดิม
  stored_name  TEXT NOT NULL,        -- ชื่อไฟล์บนดิสก์ (uuid)
  mime_type    TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Audit log (เก็บทุกการเปลี่ยนแปลงข้อมูล)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,
  payload      JSONB,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- Trigger: updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','hospitals','contracts','invoices','cheques'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t);
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Views คำนวณสถานะ (ใช้ร่วมกันทั้ง API และรายงาน)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_invoice_receivable AS
SELECT
  i.id, i.invoice_no, i.hospital_id, i.contract_id, i.period_id,
  i.issue_date, i.due_date, i.amount, i.vat_amount, i.total_amount,
  i.usage_qty, i.status, i.note, i.created_at,
  h.name AS hospital_name, h.code AS hospital_code,
  h.rep_id, h.region_id,
  c.contract_no, c.pricing_mode, c.payment_term_days,
  p.period_no, p.period_start, p.period_end,
  COALESCE(paid.allocated, 0)::numeric(14,2)  AS allocated_amount,
  COALESCE(paid.cleared, 0)::numeric(14,2)    AS cleared_amount,
  COALESCE(paid.cheque_amount, 0)::numeric(14,2) AS cheque_received_amount,
  (i.total_amount - COALESCE(paid.allocated, 0))::numeric(14,2) AS outstanding_amount,
  deliv.last_delivered_on,
  COALESCE(deliv.delivery_count, 0) AS delivery_count,
  COALESCE(att.attachment_count, 0) AS attachment_count,
  CASE
    WHEN i.status = 'CANCELLED' THEN 'CANCELLED'
    WHEN COALESCE(paid.allocated, 0) >= i.total_amount THEN 'PAID'
    WHEN COALESCE(paid.allocated, 0) > 0 THEN 'PARTIAL'
    WHEN deliv.last_delivered_on IS NOT NULL THEN 'SENT'
    ELSE 'NOT_SENT'
  END AS payment_state,
  GREATEST(CURRENT_DATE - i.due_date, 0) AS days_overdue,
  u.full_name AS rep_name
FROM invoices i
JOIN hospitals h ON h.id = i.hospital_id
LEFT JOIN users u ON u.id = h.rep_id
JOIN contracts c ON c.id = i.contract_id
LEFT JOIN contract_periods p ON p.id = i.period_id
LEFT JOIN LATERAL (
  SELECT
    SUM(a.amount) AS allocated,
    SUM(CASE WHEN ch.status = 'CLEARED' THEN a.amount ELSE 0 END) AS cleared,
    SUM(a.amount) AS cheque_amount
  FROM cheque_allocations a
  JOIN cheques ch ON ch.id = a.cheque_id
  WHERE a.invoice_id = i.id AND ch.status NOT IN ('BOUNCED', 'RETURNED')
) paid ON TRUE
LEFT JOIN LATERAL (
  SELECT MAX(d.delivered_on) AS last_delivered_on, COUNT(*) AS delivery_count
  FROM invoice_deliveries d
  WHERE d.invoice_id = i.id AND d.status <> 'RETURNED'
) deliv ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS attachment_count
  FROM attachments at
  WHERE at.entity_type = 'INVOICE' AND at.entity_id = i.id
) att ON TRUE;
