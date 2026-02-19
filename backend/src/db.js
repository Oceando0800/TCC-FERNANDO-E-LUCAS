import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASS:", process.env.DB_PASS ? "***OK***" : "***VAZIO***");
console.log("DB_NAME:", process.env.DB_NAME);


export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

export async function ensureReportGeoColumns() {
  const [latCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'reports'
       AND COLUMN_NAME = 'lat'
     LIMIT 1`
  );

  if (!Array.isArray(latCol) || latCol.length === 0) {
    await pool.query("ALTER TABLE reports ADD COLUMN lat DECIMAL(10,7) NULL");
  }

  const [lngCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'reports'
       AND COLUMN_NAME = 'lng'
     LIMIT 1`
  );

  if (!Array.isArray(lngCol) || lngCol.length === 0) {
    await pool.query("ALTER TABLE reports ADD COLUMN lng DECIMAL(10,7) NULL");
  }
}

export async function ensureModerationAndNotificationsSchema() {
  const [nameUniqueIdx] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND INDEX_NAME = 'uq_users_name'
     LIMIT 1`
  );

  if (!Array.isArray(nameUniqueIdx) || nameUniqueIdx.length === 0) {
    await pool.query("ALTER TABLE users ADD UNIQUE KEY uq_users_name (name)");
  }

  const [falseCountCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'false_report_count'
     LIMIT 1`
  );

  if (!Array.isArray(falseCountCol) || falseCountCol.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN false_report_count INT NOT NULL DEFAULT 0");
  }

  const [isBannedCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'is_banned'
     LIMIT 1`
  );
  if (!Array.isArray(isBannedCol) || isBannedCol.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0");
  }

  const [bannedReasonCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'banned_reason'
     LIMIT 1`
  );
  if (!Array.isArray(bannedReasonCol) || bannedReasonCol.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN banned_reason VARCHAR(255) NULL");
  }

  const [bannedAtCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'banned_at'
     LIMIT 1`
  );
  if (!Array.isArray(bannedAtCol) || bannedAtCol.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN banned_at TIMESTAMP NULL");
  }

  const [banCountCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'ban_count'
     LIMIT 1`
  );
  if (!Array.isArray(banCountCol) || banCountCol.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN ban_count INT NOT NULL DEFAULT 0");
  }

  const [markedFalseCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'reports'
       AND COLUMN_NAME = 'marked_false'
     LIMIT 1`
  );

  if (!Array.isArray(markedFalseCol) || markedFalseCol.length === 0) {
    await pool.query("ALTER TABLE reports ADD COLUMN marked_false TINYINT(1) NOT NULL DEFAULT 0");
  }

  const [categoryCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'reports'
       AND COLUMN_NAME = 'category'
     LIMIT 1`
  );
  if (!Array.isArray(categoryCol) || categoryCol.length === 0) {
    await pool.query(
      "ALTER TABLE reports ADD COLUMN category ENUM('entulho','domestico','industrial') NOT NULL DEFAULT 'industrial' AFTER title"
    );
  }

  await pool.query(
    "ALTER TABLE reports MODIFY COLUMN status ENUM('open','verifying','in_progress','resolved','rejected') NOT NULL DEFAULT 'open'"
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type ENUM('warning','fine','summons') NOT NULL,
      title VARCHAR(160) NOT NULL,
      message TEXT NOT NULL,
      attachment_url VARCHAR(255) NULL,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`
  );

  const [attachmentCol] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'notifications'
       AND COLUMN_NAME = 'attachment_url'
     LIMIT 1`
  );

  if (!Array.isArray(attachmentCol) || attachmentCol.length === 0) {
    await pool.query("ALTER TABLE notifications ADD COLUMN attachment_url VARCHAR(255) NULL");
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS report_history (
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
    )`
  );
}
