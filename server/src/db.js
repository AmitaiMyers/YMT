// SQLite access layer (Node's built-in node:sqlite: no native build step, one file on disk).

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, DEFAULT_WORKFLOWS } from './constants.js';
import { DEFAULT_TEMPLATES } from './defaultTemplates.js';
import { notFound } from './http.js';

const SCHEMA_PATH = new URL('./schema.sql', import.meta.url);

/** Resolve the database file location from DATA_DIR (or ':memory:' for tests). */
export function resolveDbPath(dataDir) {
  if (dataDir === ':memory:') return ':memory:';
  const absoluteDir = path.resolve(dataDir);
  mkdirSync(absoluteDir, { recursive: true });
  return path.join(absoluteDir, 'ymt.db');
}

export function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  seedDefaults(db);
  return db;
}

function seedDefaults(db) {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);

  if (count(db, 'workflows') === 0) {
    for (const workflow of DEFAULT_WORKFLOWS) {
      insert(db, 'workflows', { ...workflow, stages: JSON.stringify(workflow.stages) });
    }
  }
  if (count(db, 'templates') === 0) {
    for (const template of DEFAULT_TEMPLATES) insert(db, 'templates', template);
  }
}

// ------------------------------------------------------------------ generic helpers

const IDENTIFIER_RE = /^[a-z_]+$/;

function assertIdentifier(name) {
  if (!IDENTIFIER_RE.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
}

export function count(db, table) {
  assertIdentifier(table);
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

/** Insert a row from a plain object; returns the new id. */
export function insert(db, table, values) {
  assertIdentifier(table);
  const columns = Object.keys(values);
  columns.forEach(assertIdentifier);
  const placeholders = columns.map((column) => `:${column}`).join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  return Number(db.prepare(sql).run(values).lastInsertRowid);
}

/** Update a row by id from a plain object of changed columns. Throws 404 if no such row. */
export function update(db, table, id, values) {
  assertIdentifier(table);
  const columns = Object.keys(values);
  columns.forEach(assertIdentifier);
  const assignments = columns.map((column) => `${column} = :${column}`).join(', ');
  const result = db.prepare(`UPDATE ${table} SET ${assignments} WHERE id = :id`).run({ ...values, id });
  if (result.changes === 0) throw notFound(`${table} #${id} not found`);
}

/** Fetch a row by id or throw 404. */
export function findById(db, table, id) {
  assertIdentifier(table);
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row) throw notFound(`${table} #${id} not found`);
  return row;
}

export function removeById(db, table, id) {
  assertIdentifier(table);
  const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  if (result.changes === 0) throw notFound(`${table} #${id} not found`);
}

/**
 * Run `work` atomically. The catch block exists only to roll back and re-throw:
 * the error is never swallowed.
 */
export function transaction(db, work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function audit(db, userId, action, entity, entityId, detail = null) {
  insert(db, 'audit_log', { user_id: userId, action, entity, entity_id: entityId, detail });
}

export function nowIso() {
  return new Date().toISOString();
}

// ------------------------------------------------------------------ settings

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function getNumericSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) throw new Error(`Missing setting: ${key}`);
  const value = Number(row.value);
  if (!Number.isFinite(value)) throw new Error(`Setting ${key} is not numeric: ${row.value}`);
  return value;
}
