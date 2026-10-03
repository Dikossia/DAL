-- Dal: stage 1 schema.
-- Written in near-standard SQL so that porting to PostgreSQL is mechanical:
-- TEXT ids → uuid, INTEGER 0/1 → boolean, TEXT dates → timestamptz/date,
-- RAISE(ABORT) triggers → plpgsql functions with RAISE EXCEPTION.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student', 'expert', 'moderator')),
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Public expert profile. The name lives in users.name and changes only through moderation.
CREATE TABLE expert_profiles (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specialization TEXT NOT NULL DEFAULT '',
  bio            TEXT NOT NULL DEFAULT '',
  experience     TEXT NOT NULL DEFAULT '',
  achievements   TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  avatar         TEXT,
  verified_at    TEXT                          -- NULL: identity and payout account not yet verified
);

CREATE TABLE profile_requests (
  id         TEXT PRIMARY KEY,
  expert_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field      TEXT NOT NULL CHECK (field IN ('name', 'experience')),
  value      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT REFERENCES users(id)
);

CREATE TABLE courses (
  id              TEXT PRIMARY KEY,
  expert_id       TEXT NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'beginner' CHECK (category IN ('beginner', 'advanced', 'workshops')),
  description     TEXT NOT NULL DEFAULT '',
  price           INTEGER CHECK (price IS NULL OR price >= 0),  -- in tenge; NULL means no price set
  cover           TEXT,                                          -- library key or 'upload:<file>'
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'hidden')),
  moderation_note TEXT,
  submitted_at    TEXT,
  published_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX courses_expert ON courses(expert_id);
CREATE INDEX courses_status ON courses(status);

CREATE TABLE modules (
  id        TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title     TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL
);
CREATE INDEX modules_course ON modules(course_id, position);

CREATE TABLE lessons (
  id         TEXT PRIMARY KEY,
  module_id  TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL,
  is_free    INTEGER NOT NULL DEFAULT 0 CHECK (is_free IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX lessons_module ON lessons(module_id, position);

CREATE TABLE videos (
  lesson_id             TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  file_name             TEXT NOT NULL,   -- path inside storage/videos or 'seed:<file>'
  original_name         TEXT NOT NULL,
  mime                  TEXT NOT NULL,
  size                  INTEGER NOT NULL CHECK (size > 0),
  duration              REAL,            -- seconds, if it could be determined
  uploaded_at           TEXT NOT NULL,
  updated_after_publish INTEGER NOT NULL DEFAULT 0 CHECK (updated_after_publish IN (0, 1))
);

-- Purchase (no payment in stage 1). The price is fixed at purchase time:
-- a course price change only affects new purchases.
CREATE TABLE enrollments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  price_paid  INTEGER NOT NULL CHECK (price_paid >= 0),
  commission  INTEGER NOT NULL CHECK (commission >= 0),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunded')),
  created_at  TEXT NOT NULL,
  refunded_at TEXT,
  UNIQUE (user_id, course_id)
);
CREATE INDEX enrollments_course ON enrollments(course_id);

CREATE TABLE lesson_progress (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE reviews (
  id         TEXT PRIMARY KEY,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reply      TEXT,
  replied_at TEXT,
  hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),  -- hidden by moderation after a report
  UNIQUE (course_id, user_id)
);

CREATE TABLE review_reports (
  id          TEXT PRIMARY KEY,
  review_id   TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'kept', 'removed')),
  created_at  TEXT NOT NULL,
  decided_at  TEXT,
  decided_by  TEXT REFERENCES users(id)
);

CREATE TABLE forecasts (
  id           TEXT PRIMARY KEY,
  expert_id    TEXT NOT NULL REFERENCES users(id),
  ticker       TEXT NOT NULL,
  name         TEXT NOT NULL,
  direction    TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  start_price  REAL NOT NULL CHECK (start_price > 0),
  target_price REAL NOT NULL CHECK (target_price > 0),
  deadline     TEXT NOT NULL,              -- check date, YYYY-MM-DD
  rationale    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'success', 'miss')),
  result_price REAL,
  published_at TEXT NOT NULL,
  resolved_at  TEXT,
  resolved_by  TEXT REFERENCES users(id),
  CHECK ((direction = 'up' AND target_price > start_price) OR (direction = 'down' AND target_price < start_price))
);
CREATE INDEX forecasts_expert ON forecasts(expert_id, status);
-- An expert may have only one open forecast per ticker.
CREATE UNIQUE INDEX forecasts_one_active_per_ticker ON forecasts(expert_id, ticker) WHERE status = 'active';

-- A published forecast cannot be changed or deleted. The outcome is set once.
CREATE TRIGGER forecasts_no_delete BEFORE DELETE ON forecasts
BEGIN SELECT RAISE(ABORT, 'forecast_immutable'); END;

CREATE TRIGGER forecasts_terms_immutable
BEFORE UPDATE OF expert_id, ticker, name, direction, start_price, target_price, deadline, rationale, published_at ON forecasts
BEGIN SELECT RAISE(ABORT, 'forecast_immutable'); END;

CREATE TRIGGER forecasts_resolve_once BEFORE UPDATE OF status, result_price ON forecasts
WHEN OLD.status <> 'active'
BEGIN SELECT RAISE(ABORT, 'forecast_already_resolved'); END;

CREATE TABLE forecast_comments (
  id          TEXT PRIMARY KEY,
  forecast_id TEXT NOT NULL REFERENCES forecasts(id),
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- A course someone has bought cannot be deleted (only hidden).
CREATE TRIGGER courses_keep_purchased BEFORE DELETE ON courses
WHEN EXISTS (SELECT 1 FROM enrollments WHERE course_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'course_has_students'); END;

-- Reviews are never deleted: on violation, moderation hides them with the hidden flag.
-- Only a buyer can leave a review, and a purchased course cannot be deleted, so the cascade never reaches here.
CREATE TRIGGER reviews_no_delete BEFORE DELETE ON reviews
BEGIN SELECT RAISE(ABORT, 'review_immutable'); END;
