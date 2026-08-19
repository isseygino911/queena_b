-- Migration: African drum challenge scores
-- Run once against the target database.
--
-- The drum game keeps its own table rather than reusing `scores`: that table
-- requires a `track_id` referencing an uploaded track, and a drum challenge is
-- generated client-side with no track behind it. Keeping them apart also means
-- the piano leaderboard queries are unaffected.

CREATE TABLE IF NOT EXISTS drum_scores (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  user_id         INT,
  -- Signed INT to match users.id, which is int(11) on the live database.
  -- (schema.sql declares users.id as INT UNSIGNED, but the deployed table is
  -- signed; a mismatched foreign key is rejected with errno 150.)
  instrument_slug VARCHAR(32) NOT NULL,   -- e.g. 'djembe'
  challenge_id    VARCHAR(64) NOT NULL,   -- e.g. 'djembe-3'
  score           INT NOT NULL,
  accuracy        FLOAT,
  max_combo       INT,
  perfect_count   INT,
  good_count      INT,
  miss_count      INT,
  total_notes     INT,
  grade           VARCHAR(4),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Serves the leaderboard (top scores for one challenge) and, because the
-- challenge id is the leading column, the per-user progress roll-up too.
CREATE INDEX idx_drum_scores_challenge ON drum_scores(challenge_id, score DESC);
CREATE INDEX idx_drum_scores_user      ON drum_scores(user_id);
