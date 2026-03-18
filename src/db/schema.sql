-- RhythmSense Database Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS rhythmsense CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE rhythmsense;

CREATE TABLE IF NOT EXISTS users (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  username    VARCHAR(50)  UNIQUE NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tracks (
  id                   INT PRIMARY KEY AUTO_INCREMENT,
  title                VARCHAR(200) NOT NULL,
  artist               VARCHAR(200),
  bpm                  FLOAT,
  duration             FLOAT,
  section_start        FLOAT,   -- best section start in seconds (AI-selected)
  section_end          FLOAT,   -- best section end in seconds
  original_file_path   VARCHAR(500),
  processed_file_path  VARCHAR(500),
  midi_data            JSON,
  waveform_data        JSON,
  difficulty           VARCHAR(20) DEFAULT 'medium',
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Run this on the live database to add section columns to existing tables:
-- ALTER TABLE tracks
--   ADD COLUMN section_start FLOAT NULL AFTER duration,
--   ADD COLUMN section_end   FLOAT NULL AFTER section_start;

CREATE TABLE IF NOT EXISTS scores (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  user_id       INT,
  track_id      INT NOT NULL,
  score         INT NOT NULL,
  accuracy      FLOAT,
  max_combo     INT,
  perfect_count INT,
  good_count    INT,
  miss_count    INT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE SET NULL,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_progress (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT NOT NULL,
  track_id    INT NOT NULL,
  best_score  INT,
  play_count  INT DEFAULT 0,
  UNIQUE KEY uq_user_track (user_id, track_id),
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);
