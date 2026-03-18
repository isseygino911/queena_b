-- Migration: fix scores table
-- Run once against the live database.

-- 1. Fix user_id type to match users.id (INT UNSIGNED)
ALTER TABLE scores MODIFY COLUMN user_id INT UNSIGNED;

-- 2. Add missing columns
ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS total_notes INT AFTER miss_count,
  ADD COLUMN IF NOT EXISTS grade VARCHAR(4) AFTER total_notes;
