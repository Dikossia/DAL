-- Anchoring forecasts on the Solana blockchain (devnet): signature of the transaction carrying a memo with the forecast terms.
-- The on-chain record itself is immutable; this table stores a reference to it. It is written once and never changes.
CREATE TABLE forecast_anchors (
  forecast_id TEXT PRIMARY KEY REFERENCES forecasts(id) ON DELETE RESTRICT,
  cluster     TEXT NOT NULL CHECK (cluster IN ('devnet', 'mainnet-beta')),
  signature   TEXT NOT NULL UNIQUE,
  wallet      TEXT NOT NULL,
  memo        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE TRIGGER forecast_anchors_immutable BEFORE UPDATE ON forecast_anchors
BEGIN SELECT RAISE(ABORT, 'anchor_immutable'); END;
CREATE TRIGGER forecast_anchors_no_delete BEFORE DELETE ON forecast_anchors
BEGIN SELECT RAISE(ABORT, 'anchor_immutable'); END;
