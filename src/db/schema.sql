-- RhythmSense Database Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS u553161013_quenna CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE u553161013_quenna;

CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(50)  UNIQUE NOT NULL,
  email          VARCHAR(255) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  is_admin       BOOLEAN DEFAULT FALSE,
  refresh_token  VARCHAR(512) DEFAULT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS tracks (
  id                   CHAR(36) PRIMARY KEY,  -- UUID
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tracks_created ON tracks(created_at);

CREATE TABLE IF NOT EXISTS scores (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  user_id       INT,
  track_id      CHAR(36) NOT NULL,  -- UUID reference
  score         INT NOT NULL,
  accuracy      FLOAT,
  max_combo     INT,
  perfect_count INT,
  good_count    INT,
  miss_count    INT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE SET NULL,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_scores_track ON scores(track_id);
CREATE INDEX idx_scores_user ON scores(user_id);

CREATE TABLE IF NOT EXISTS user_progress (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT NOT NULL,
  track_id    CHAR(36) NOT NULL,  -- UUID reference
  best_score  INT,
  play_count  INT DEFAULT 0,
  UNIQUE KEY uq_user_track (user_id, track_id),
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_progress_user ON user_progress(user_id);
