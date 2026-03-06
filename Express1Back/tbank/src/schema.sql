-- SQLite schema for MVP Billing Service.
-- Important MVP choices:
-- 1) WAL mode for concurrency
-- 2) Unique inv_id to guarantee idempotency by invoice id (InvId)
-- 3) Minimal fields to keep service simple

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  price_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  delivery_type TEXT NOT NULL,
  payload_ref TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  inv_id INTEGER NOT NULL UNIQUE,
  robokassa_pay_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  converted_sale_id TEXT
);

-- Idempotency for checkout creation:
-- same (user_id, idempotency_key) should return the same session/invoice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sale_sessions_user_idem
ON sale_sessions(user_id, idempotency_key);

CREATE TABLE IF NOT EXISTS sales (
  sale_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL, -- pending|paid|canceled|refunded
  inv_id INTEGER NOT NULL UNIQUE,
  out_sum TEXT,         -- OutSum as received from Robokassa
  paid_at TEXT,
  fulfillment_ref TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_sales_user ON sales(user_id);

-- ===== Additional indexes for MVP listing/filtering =====

-- Products: speed up listing filters
CREATE INDEX IF NOT EXISTS ix_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS ix_products_title ON products(title);

-- Sales: speed up filters and sorting by created_at DESC
CREATE INDEX IF NOT EXISTS ix_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS ix_sales_paid_at ON sales(paid_at);

CREATE INDEX IF NOT EXISTS ix_sales_status_created_at ON sales(status, created_at);
CREATE INDEX IF NOT EXISTS ix_sales_user_created_at ON sales(user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_sales_product_created_at ON sales(product_id, created_at);

-- Useful combined filter (userId + productId)
CREATE INDEX IF NOT EXISTS ix_sales_user_product_created_at ON sales(user_id, product_id, created_at);
