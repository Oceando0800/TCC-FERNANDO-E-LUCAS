CREATE DATABASE IF NOT EXISTS scdri;
USE scdri;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  cpf CHAR(11) NOT NULL UNIQUE,
  CONSTRAINT uq_users_name UNIQUE (name),
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  false_report_count INT NOT NULL DEFAULT 0,
  is_banned TINYINT(1) NOT NULL DEFAULT 0,
  banned_reason VARCHAR(255) NULL,
  banned_at TIMESTAMP NULL,
  avatar VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  category ENUM('entulho','domestico','industrial') NOT NULL DEFAULT 'industrial',
  urgency ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  description TEXT NOT NULL,
  location VARCHAR(200) NULL,
  status ENUM('open','verifying','in_progress','resolved','rejected') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  image VARCHAR(255) NULL,
  lat  DECIMAL(10,7) NULL,
  lng DECIMAL(10,7) NULL,
  marked_false TINYINT(1) NOT NULL DEFAULT 0,
  reject_reason VARCHAR(255) NULL,
  reviewed_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_reports_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('warning','fine','summons') NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  attachment_url VARCHAR(255) NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS report_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  changed_by INT NULL,
  action VARCHAR(60) NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'false_report_count'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN false_report_count INT NOT NULL DEFAULT 0'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'is_banned'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'banned_reason'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN banned_reason VARCHAR(255) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'banned_at'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN banned_at TIMESTAMP NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'reports'
        AND COLUMN_NAME = 'category'
    ),
    'SELECT 1',
    'ALTER TABLE reports ADD COLUMN category ENUM(''entulho'',''domestico'',''industrial'') NOT NULL DEFAULT ''industrial'' AFTER title'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'reports'
        AND COLUMN_NAME = 'lat'
    ),
    'SELECT 1',
    'ALTER TABLE reports ADD COLUMN lat DECIMAL(10,7) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'reports'
        AND COLUMN_NAME = 'lng'
    ),
    'SELECT 1',
    'ALTER TABLE reports ADD COLUMN lng DECIMAL(10,7) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'reports'
        AND COLUMN_NAME = 'marked_false'
    ),
    'SELECT 1',
    'ALTER TABLE reports ADD COLUMN marked_false TINYINT(1) NOT NULL DEFAULT 0'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'notifications'
        AND COLUMN_NAME = 'attachment_url'
    ),
    'SELECT 1',
    'ALTER TABLE notifications ADD COLUMN attachment_url VARCHAR(255) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE reports
  MODIFY COLUMN status ENUM('open','verifying','in_progress','resolved','rejected') NOT NULL DEFAULT 'open';

INSERT INTO users (name, cpf, password_hash, role)
VALUES ('Admin', '00000000000', '$2b$10$2iBl72vHkfvBxbpmpHowHuc5j80xROMQQWt41zENt/uqO.cebaUVa', 'admin')
ON DUPLICATE KEY UPDATE id = id;

