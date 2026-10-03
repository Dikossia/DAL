-- Course review: left once after completing the whole course and never changed afterwards.
-- The expert can only reply (reply); moderation can hide it after a report (hidden).
CREATE TRIGGER reviews_text_immutable BEFORE UPDATE OF course_id, user_id, rating, text, created_at ON reviews
BEGIN SELECT RAISE(ABORT, 'review_immutable'); END;

-- Anchoring a review on Solana (devnet): reference to the transaction with the memo (rating, course, text hash). Written once, never changed.
CREATE TABLE review_anchors (
  review_id  TEXT PRIMARY KEY REFERENCES reviews(id) ON DELETE RESTRICT,
  cluster    TEXT NOT NULL CHECK (cluster IN ('devnet', 'mainnet-beta')),
  signature  TEXT NOT NULL UNIQUE,
  wallet     TEXT NOT NULL,
  memo       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER review_anchors_immutable BEFORE UPDATE ON review_anchors
BEGIN SELECT RAISE(ABORT, 'anchor_immutable'); END;
CREATE TRIGGER review_anchors_no_delete BEFORE DELETE ON review_anchors
BEGIN SELECT RAISE(ABORT, 'anchor_immutable'); END;

-- Lesson questions and comments: course students, the course expert (who answers) and the moderator.
CREATE TABLE lesson_comments (
  id         TEXT PRIMARY KEY,
  lesson_id  TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
);
CREATE INDEX lesson_comments_lesson ON lesson_comments(lesson_id, created_at);
