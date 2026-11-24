// SQLite access layer (Node's built-in node:sqlite: no native build step, one file on disk).

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, DEFAULT_WORKFLOWS, DEFAULT_DISCOVERY_QUESTIONS, MANDATE_SPEC } from './constants.js';
import { DEFAULT_TEMPLATES } from './defaultTemplates.js';
import { notFound } from './http.js';
import { seedMandates, applySpec2211 } from './research/mandates.js';
import { seedServices } from './research/catalogue.js';

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
  const schemaSql = readFileSync(SCHEMA_PATH, 'utf8');
  migrateTables(db, schemaSql); // bring existing tables to the shape in schema.sql (before indexes on new columns)
  db.exec(schemaSql);           // create anything missing (new tables, indexes)
  seedDefaults(db);
  return db;
}

// ------------------------------------------------------------------ schema migrations
//
// schema.sql is the single source of truth. On start-up every existing table is compared with its definition
// there (column names + NOT NULL, and the text of the column list, so changed CHECK rules count too). If they
// differ, the table is rebuilt with SQLite's documented 12-step
// procedure: create the new shape, copy every row of the shared columns, drop the old table, rename, then
// verify all foreign keys before committing. No data is discarded.

function tableShape(db, table) {
  return db.prepare(`SELECT name, "notnull" AS required FROM pragma_table_info('${table}') ORDER BY cid`).all()
    .map((column) => `${column.name}:${column.required}`).join(',');
}

/** The column list of a table's CREATE statement, whitespace-collapsed (the table name is left out: renames change it). */
function tableDefinition(db, table) {
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return sql.slice(sql.indexOf('(')).replace(/\s+/g, ' ').trim();
}

function rebuildTable(db, table, createSql) {
  const columns = (shape) => shape.split(',').map((entry) => entry.split(':')[0]);
  const reference = new DatabaseSync(':memory:');
  reference.exec(createSql);
  const shared = columns(tableShape(reference, table)).filter((name) => columns(tableShape(db, table)).includes(name));
  reference.close();
  const newSql = createSql.replace(/^CREATE TABLE (IF NOT EXISTS )?"?\w+"?/i, `CREATE TABLE ${table}__new`);

  db.exec('PRAGMA foreign_keys = OFF'); // must be outside the transaction; otherwise DROP TABLE would cascade
  db.exec('BEGIN');
  try {
    db.exec(newSql);
    db.exec(`INSERT INTO ${table}__new (${shared.join(', ')}) SELECT ${shared.join(', ')} FROM ${table}`);
    db.exec(`DROP TABLE ${table}`);
    db.exec(`ALTER TABLE ${table}__new RENAME TO ${table}`);
    const broken = db.prepare('PRAGMA foreign_key_check').all();
    if (broken.length > 0) throw new Error(`Migration of ${table} would break ${broken.length} foreign key(s)`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK'); // undo the half-done rebuild and stop start-up with the original error
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function migrateTables(db, schemaSql) {
  const reference = new DatabaseSync(':memory:');
  reference.exec(schemaSql);
  const tables = reference.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  const migrated = [];
  for (const { name, sql } of tables) {
    assertIdentifier(name);
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    if (!exists) continue;
    if (tableShape(db, name) === tableShape(reference, name) && tableDefinition(db, name) === tableDefinition(reference, name)) continue;
    rebuildTable(db, name, sql);
    migrated.push(name);
  }
  reference.close();
  if (migrated.length > 0) console.log(`Database migrated: ${migrated.join(', ')}`);
}

function seedDefaults(db) {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);
  // AI tasks added in later releases get their default provider and model; existing choices are kept.
  const tasks = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'ai_tasks'").get().value);
  const withDefaults = { ...JSON.parse(DEFAULT_SETTINGS.ai_tasks), ...tasks };
  db.prepare("UPDATE settings SET value = ? WHERE key = 'ai_tasks'").run(JSON.stringify(withDefaults));

  if (count(db, 'workflows') === 0) {
    for (const workflow of DEFAULT_WORKFLOWS) {
      insert(db, 'workflows', { ...workflow, stages: JSON.stringify(workflow.stages) });
    }
  }
  if (count(db, 'templates') === 0) {
    for (const template of DEFAULT_TEMPLATES) insert(db, 'templates', template);
  }
  if (count(db, 'discovery_questions') === 0) {
    DEFAULT_DISCOVERY_QUESTIONS.forEach((question, index) => insert(db, 'discovery_questions', { ...question, position: index + 1 }));
  }
  seedServices(db);
  const seeded = seedMandates(db);
  // One-time move of an existing database onto the lead-finding agent spec of 22.11.2026.
  const marker = db.prepare("SELECT value FROM settings WHERE key = 'mandate_spec'").get();
  if (marker.value !== MANDATE_SPEC) {
    if (!seeded) applySpec2211(db);
    db.prepare("UPDATE settings SET value = ? WHERE key = 'mandate_spec'").run(MANDATE_SPEC);
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
