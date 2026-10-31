import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.AISEKI_DB || path.resolve(process.cwd(), 'data/aiseki.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY, name TEXT, current_tz TEXT DEFAULT 'Asia/Tokyo', week_start INTEGER DEFAULT 1, target_kcal INTEGER DEFAULT 1860
);
INSERT OR IGNORE INTO tenants(id,name,current_tz,week_start) VALUES ('default','Darling','Asia/Tokyo',1);
CREATE TABLE IF NOT EXISTS meals (
  external_id TEXT PRIMARY KEY, tenant_id TEXT DEFAULT 'default',
  date TEXT NOT NULL, tz TEXT, utc_offset TEXT, eaten_time TEXT,
  std_date TEXT, std_time TEXT, meal_type TEXT NOT NULL, tags TEXT DEFAULT '[]',
  status TEXT NOT NULL, menu TEXT, kcal REAL NOT NULL, kcal_pm REAL NOT NULL,
  protein_g REAL, protein_pm REAL, fat_g REAL, fat_pm REAL, carbs_g REAL, carbs_pm REAL, salt_g REAL, salt_pm REAL,
  value_source TEXT, report_source TEXT NOT NULL, items TEXT, note TEXT, place TEXT, emoji TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS days (
  external_id TEXT PRIMARY KEY, tenant_id TEXT DEFAULT 'default',
  date TEXT NOT NULL, tz TEXT NOT NULL, measured_time TEXT, std_date TEXT, std_time TEXT,
  weight_kg REAL, body_fat_pct REAL, bmi REAL, condition_note TEXT, emoji TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, date, tz)
);
CREATE TABLE IF NOT EXISTS agent_keys (
  id TEXT PRIMARY KEY, tenant_id TEXT DEFAULT 'default', public_key TEXT, label TEXT, scope TEXT,
  status TEXT DEFAULT 'pending', expires_at TEXT, predecessor_key_id TEXT, created_at TEXT DEFAULT (datetime('now')), last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT DEFAULT 'default', actor TEXT, event TEXT, key_id TEXT, detail TEXT, created_at TEXT DEFAULT (datetime('now'))
);
`);
try { db.exec(`ALTER TABLE tenants ADD COLUMN target_kcal INTEGER DEFAULT 1860`); } catch {}
try { db.exec(`ALTER TABLE days ADD COLUMN emoji TEXT`); } catch {}
try { db.exec(`ALTER TABLE meals ADD COLUMN emoji TEXT`); } catch {}

export function rowToMeal(r){
  if(!r) return null;
  return { ...r, tags: JSON.parse(r.tags||'[]'), items: r.items ? JSON.parse(r.items) : null };
}
export function rowToDay(r){ return r || null; }
