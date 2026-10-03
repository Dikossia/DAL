-- Dal, stage 2: a shared product model for the "Work with an expert", "Community" and "Ideas & analysis" modes.
-- Courses stay in their own tables (they have modules, lessons and videos). All other products share one shape:
-- author, title, description, price, cover, reviews, rating, moderation. They differ only by type.
--   experts:   consultation (single session), personal (session package), mentorship (long-term support, session package)
--   community: clubs (private club: meetings and chat), chats (chat with the expert and members): subscription
--   ideas:     investment (investment idea), reviews (market or company review): material, free or paid

CREATE TABLE products (
  id              TEXT PRIMARY KEY,
  expert_id       TEXT NOT NULL REFERENCES users(id),
  mode            TEXT NOT NULL CHECK (mode IN ('experts', 'community', 'ideas')),
  type            TEXT NOT NULL CHECK (type IN ('consultation', 'personal', 'mentorship', 'clubs', 'chats', 'investment', 'reviews')),
  title           TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  price           INTEGER CHECK (price IS NULL OR price >= 0),
  cover           TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'hidden')),
  duration_min    INTEGER CHECK (duration_min IS NULL OR duration_min BETWEEN 15 AND 240),  -- session length
  sessions        INTEGER CHECK (sessions IS NULL OR sessions BETWEEN 1 AND 52),            -- sessions in the package
  period_days     INTEGER CHECK (period_days IS NULL OR period_days BETWEEN 7 AND 365),     -- subscription period
  meeting_url     TEXT,     -- call or club meeting link: visible to buyers only
  schedule_note   TEXT,     -- club meeting schedule in plain words
  content         TEXT,     -- text of an idea or review material
  moderation_note TEXT,
  submitted_at    TEXT,
  published_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK ((mode = 'experts' AND type IN ('consultation', 'personal', 'mentorship'))
      OR (mode = 'community' AND type IN ('clubs', 'chats'))
      OR (mode = 'ideas' AND type IN ('investment', 'reviews')))
);
CREATE INDEX products_expert ON products(expert_id);
CREATE INDEX products_status ON products(status, mode);

-- Product purchase. For sessions: number of sessions in the package; for subscriptions: validity period.
CREATE TABLE product_purchases (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  product_id     TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  price_paid     INTEGER NOT NULL CHECK (price_paid >= 0),
  commission     INTEGER NOT NULL CHECK (commission >= 0),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunded')),
  sessions_total INTEGER,
  expires_at     TEXT,
  created_at     TEXT NOT NULL,
  refunded_at    TEXT,
  UNIQUE (user_id, product_id)
);
CREATE INDEX product_purchases_product ON product_purchases(product_id);

-- A subscription renewal is a separate sale (for expert income).
CREATE TABLE product_renewals (
  id          TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES product_purchases(id),
  price_paid  INTEGER NOT NULL CHECK (price_paid >= 0),
  commission  INTEGER NOT NULL CHECK (commission >= 0),
  created_at  TEXT NOT NULL
);

-- Expert schedule slots for sessions. A booked slot cannot be deleted.
CREATE TABLE product_slots (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  starts_at   TEXT NOT NULL,
  booked_by   TEXT REFERENCES users(id),
  purchase_id TEXT REFERENCES product_purchases(id),
  booked_at   TEXT,
  UNIQUE (product_id, starts_at)
);
CREATE INDEX product_slots_user ON product_slots(booked_by);

CREATE TRIGGER product_slots_keep_booked BEFORE DELETE ON product_slots
WHEN OLD.booked_by IS NOT NULL AND EXISTS (SELECT 1 FROM products WHERE id = OLD.product_id)
BEGIN SELECT RAISE(ABORT, 'slot_booked'); END;

CREATE TABLE product_messages (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX product_messages_product ON product_messages(product_id, created_at);

CREATE TABLE product_reviews (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reply      TEXT,
  replied_at TEXT,
  hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  UNIQUE (product_id, user_id)
);
CREATE TRIGGER product_reviews_no_delete BEFORE DELETE ON product_reviews
BEGIN SELECT RAISE(ABORT, 'review_immutable'); END;

CREATE TABLE product_review_reports (
  id          TEXT PRIMARY KEY,
  review_id   TEXT NOT NULL REFERENCES product_reviews(id),
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'kept', 'removed')),
  created_at  TEXT NOT NULL,
  decided_at  TEXT,
  decided_by  TEXT REFERENCES users(id)
);

CREATE TRIGGER products_keep_purchased BEFORE DELETE ON products
WHEN EXISTS (SELECT 1 FROM product_purchases WHERE product_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'course_has_students'); END;

-- Favorites: courses and products.
CREATE TABLE favorites (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

-- Uploaded profile photo (student or expert) and expert social links.
ALTER TABLE users ADD COLUMN avatar_file TEXT;
ALTER TABLE expert_profiles ADD COLUMN socials TEXT NOT NULL DEFAULT '{}';
