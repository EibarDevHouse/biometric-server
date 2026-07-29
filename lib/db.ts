import sqlite3 from "sqlite3";
import { existsSync, mkdirSync } from "fs";
import path from "path";

const dbDir = path.join(process.cwd(), "data");
const dbPath = path.join(dbDir, "biometric.db");

// Ensure data directory exists
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

let db: sqlite3.Database;

export function initDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      migrate()
        .then(resolve)
        .catch(reject);
    });
  });
}

function migrate(): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS devices (
      dev_id TEXT PRIMARY KEY,
      fk_name TEXT,
      firmware TEXT,
      fk_bin_data_lib TEXT,
      supported_enroll_data TEXT,
      last_seen_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS commands (
      trans_id INTEGER PRIMARY KEY AUTOINCREMENT,
      dev_id TEXT NOT NULL,
      cmd_code TEXT NOT NULL,
      cmd_param TEXT,
      cmd_binary BLOB,
      status TEXT NOT NULL DEFAULT 'WAIT' CHECK (status IN ('WAIT', 'RUN', 'RESULT', 'ERROR')),
      result_json TEXT,
      result_binary BLOB,
      cmd_return_code TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      FOREIGN KEY (dev_id) REFERENCES devices(dev_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dev_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      verify_mode TEXT,
      io_mode INTEGER,
      io_time TEXT,
      log_image BLOB,
      received_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      FOREIGN KEY (dev_id) REFERENCES devices(dev_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dev_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      user_privilege TEXT,
      user_photo BLOB,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      UNIQUE(dev_id, user_id),
      FOREIGN KEY (dev_id) REFERENCES devices(dev_id)
    );

    CREATE TABLE IF NOT EXISTS enroll_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dev_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      backup_number INTEGER NOT NULL,
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      UNIQUE(dev_id, user_id, backup_number),
      FOREIGN KEY (dev_id) REFERENCES devices(dev_id)
    );

    CREATE TABLE IF NOT EXISTS block_buffer (
      dev_id TEXT NOT NULL,
      trans_id INTEGER NOT NULL,
      blk_no INTEGER NOT NULL,
      data BLOB NOT NULL,
      received_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      PRIMARY KEY (dev_id, trans_id, blk_no),
      FOREIGN KEY (dev_id) REFERENCES devices(dev_id),
      FOREIGN KEY (trans_id) REFERENCES commands(trans_id)
    );

    CREATE TABLE IF NOT EXISTS raw_traffic (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      dev_id TEXT,
      request_code TEXT,
      headers_json TEXT,
      body_preview TEXT,
      body_size INTEGER,
      binary_size INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_commands_dev_id_status ON commands(dev_id, status);
    CREATE INDEX IF NOT EXISTS idx_attendance_logs_dev_id ON attendance_logs(dev_id);
    CREATE INDEX IF NOT EXISTS idx_users_dev_id ON users(dev_id);
    CREATE INDEX IF NOT EXISTS idx_raw_traffic_created_at ON raw_traffic(created_at DESC);
  `;

  return execAsync(sql);
}

export function runAsync(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function getAsync<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

export function allAsync<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });
}

export function execAsync(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function closeDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
}

export { db };
