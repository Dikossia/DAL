-- Blockchain features that work "under the hood": built-in wallets, a queue of Solana records,
-- NFT certificates, orders with a price breakdown and a network fee, account recovery.

-- Platform settings that must survive restarts (e.g. the key that encrypts built-in wallets).
CREATE TABLE chain_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Built-in wallet linked to an account. Created automatically the first time it is needed.
-- The secret is stored encrypted with the platform key, so the wallet survives a password reset.
CREATE TABLE wallets (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  address     TEXT NOT NULL UNIQUE,
  secret_enc  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  exported_at TEXT
);
CREATE TRIGGER wallets_keep_key BEFORE UPDATE OF user_id, address, secret_enc ON wallets
BEGIN SELECT RAISE(ABORT, 'wallet_immutable'); END;
CREATE TRIGGER wallets_no_delete BEFORE DELETE ON wallets
BEGIN SELECT RAISE(ABORT, 'wallet_immutable'); END;

-- Queue of Solana records. The business action (publishing, purchase, completion) is saved first;
-- the record is written in the background with retries, so a Solana outage never blocks DAL.
CREATE TABLE chain_jobs (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('forecast', 'forecast_result', 'certificate', 'payment')),
  ref_id        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'confirmed', 'failed')),
  memo          TEXT,
  signature     TEXT,
  extra         TEXT,                 -- JSON: NFT address, payment details
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  next_try_at   TEXT NOT NULL,
  sent_at       TEXT,
  cost_lamports INTEGER,              -- what DAL actually spent: transaction fee + storage deposit
  created_at    TEXT NOT NULL,
  confirmed_at  TEXT,
  UNIQUE (kind, ref_id)
);
CREATE INDEX chain_jobs_due ON chain_jobs(status, next_try_at);
CREATE TRIGGER chain_jobs_confirmed_final BEFORE UPDATE ON chain_jobs
WHEN OLD.status = 'confirmed'
BEGIN SELECT RAISE(ABORT, 'anchor_immutable'); END;
CREATE TRIGGER chain_jobs_no_delete BEFORE DELETE ON chain_jobs
BEGIN SELECT RAISE(ABORT, 'anchor_immutable'); END;

-- Forecasts: the resolution rule is fixed at publication; the expert pays a small network fee per forecast.
ALTER TABLE forecasts ADD COLUMN rule TEXT;
ALTER TABLE forecasts ADD COLUMN network_fee INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER forecasts_rule_immutable BEFORE UPDATE OF rule, network_fee ON forecasts
BEGIN SELECT RAISE(ABORT, 'forecast_immutable'); END;

-- Course certificate: issued automatically when every lesson is completed; the NFT is minted in the background.
CREATE TABLE certificates (
  id            TEXT PRIMARY KEY,       -- public code used in the verification link
  user_id       TEXT NOT NULL REFERENCES users(id),
  course_id     TEXT NOT NULL REFERENCES courses(id),
  student_name  TEXT NOT NULL,
  course_title  TEXT NOT NULL,
  expert_name   TEXT NOT NULL,
  lessons       INTEGER NOT NULL,
  completed_at  TEXT NOT NULL,
  issued_at     TEXT NOT NULL,
  owner_address TEXT NOT NULL,          -- the student's built-in wallet
  asset_address TEXT,                   -- the NFT, once minted
  UNIQUE (user_id, course_id)
);
CREATE TRIGGER certificates_immutable BEFORE UPDATE OF id, user_id, course_id, student_name, course_title, expert_name, lessons, completed_at, issued_at, owner_address ON certificates
BEGIN SELECT RAISE(ABORT, 'certificate_immutable'); END;
CREATE TRIGGER certificates_asset_once BEFORE UPDATE OF asset_address ON certificates
WHEN OLD.asset_address IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'certificate_immutable'); END;
CREATE TRIGGER certificates_no_delete BEFORE DELETE ON certificates
BEGIN SELECT RAISE(ABORT, 'certificate_immutable'); END;

-- Orders: the buyer sees the full price, DAL's commission and the network fee before paying.
CREATE TABLE orders (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  item_kind    TEXT NOT NULL CHECK (item_kind IN ('course', 'product')),
  item_id      TEXT NOT NULL,
  price        INTEGER NOT NULL CHECK (price >= 0),
  commission   INTEGER NOT NULL CHECK (commission >= 0),
  network_fee  INTEGER NOT NULL CHECK (network_fee >= 0),
  total        INTEGER NOT NULL CHECK (total >= 0),
  method       TEXT NOT NULL CHECK (method IN ('card', 'usdc')),
  status       TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  usdc_total   INTEGER,                 -- micro-USDC (6 decimals)
  usdc_expert  INTEGER,
  usdc_dal     INTEGER,
  payer_wallet TEXT,
  expert_wallet TEXT,
  signature    TEXT UNIQUE,
  error        TEXT,
  created_at   TEXT NOT NULL,
  paid_at      TEXT
);
CREATE INDEX orders_user ON orders(user_id, created_at);

ALTER TABLE enrollments ADD COLUMN network_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN order_id TEXT;
ALTER TABLE product_purchases ADD COLUMN network_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_purchases ADD COLUMN order_id TEXT;
ALTER TABLE product_renewals ADD COLUMN network_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_renewals ADD COLUMN order_id TEXT;

-- Account recovery: one-time codes (sent by email in production).
CREATE TABLE password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);
CREATE INDEX password_resets_user ON password_resets(user_id, created_at);
