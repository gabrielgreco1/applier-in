import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'applier.db');

function createDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      total_jobs INTEGER NOT NULL DEFAULT 0,
      applied_jobs INTEGER NOT NULL DEFAULT 0,
      needs_info_jobs INTEGER NOT NULL DEFAULT 0,
      manual_jobs INTEGER NOT NULL DEFAULT 0,
      discarded_jobs INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      stage TEXT NOT NULL,
      message TEXT NOT NULL,
      meta TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_logs_run_id ON logs(run_id);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Unknown',
      company TEXT NOT NULL DEFAULT 'Unknown',
      url TEXT,
      score INTEGER,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_run_id ON jobs(run_id);
  `);

  return db;
}

const g = globalThis as unknown as { _db: Database.Database };
export const db = g._db ?? createDb();
g._db = db;
