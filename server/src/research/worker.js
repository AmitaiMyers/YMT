// Background work for research: queued runs and calibrations are the queue (no separate jobs table).
// One item at a time, owners take turns, weekly runs are created once per mandate per ISO week.

import { insert, audit } from '../db.js';
import { budgetStatus } from '../ai/service.js';
import { executeRun, executeCalibration, executeContactSearch } from './runner.js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Day of week in Israel (0 = Sunday), so "weekly on Sunday" means Sunday for the team. */
export function israelWeekday(now) {
  const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: ISRAEL_TIME_ZONE }).format(now);
  return WEEKDAY_INDEX[name];
}

/** ISO-8601 week key, e.g. "2026-W47". */
export function isoWeekKey(now) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Runs interrupted by a restart cannot resume mid-way: mark them failed so the owner can run again. */
export function recoverInterrupted(db) {
  db.prepare("UPDATE research_runs SET status = 'failed', error = 'Interrupted by a server restart', finished_at = ? WHERE status = 'running'")
    .run(new Date().toISOString());
  db.prepare("UPDATE calibrations SET status = 'failed', error = 'Interrupted by a server restart' WHERE status = 'running'").run();
  db.prepare("UPDATE contact_searches SET status = 'failed', error = 'Interrupted by a server restart' WHERE status = 'running'").run();
}

/** Queue this week's run for every active weekly mandate whose weekday is today (idempotent per ISO week). */
export function scheduleWeeklyRuns(db, now = new Date()) {
  const due = db.prepare(`SELECT id, current_version_id, default_batch, weekly_watch_list_id FROM mandates
    WHERE status = 'active' AND schedule = 'weekly' AND owner_id IS NOT NULL AND schedule_weekday = ?`).all(israelWeekday(now));
  const week = isoWeekKey(now);
  let created = 0;
  for (const mandate of due) {
    const exists = db.prepare('SELECT 1 FROM research_runs WHERE mandate_id = ? AND week_key = ?').get(mandate.id, week);
    if (exists) continue;
    insert(db, 'research_runs', {
      mandate_id: mandate.id, mandate_version_id: mandate.current_version_id, trigger: 'weekly', week_key: week, batch_size: mandate.default_batch,
      watch_list_id: mandate.weekly_watch_list_id,
    });
    created += 1;
  }
  return created;
}

/** Items paused by the monthly cap go back to the queue once there is room again (new month or a higher cap). */
export function requeueWaiting(db, now = new Date()) {
  if (budgetStatus(db, now).remaining <= 0) return;
  db.prepare("UPDATE research_runs SET status = 'queued' WHERE status = 'waiting_budget'").run();
  db.prepare("UPDATE calibrations SET status = 'queued' WHERE status = 'waiting_budget'").run();
  db.prepare("UPDATE contact_searches SET status = 'queued' WHERE status = 'waiting_budget'").run();
}

/** The queued run whose owner was served longest ago (owners take turns), else a decision-maker search, else a calibration. */
function nextItem(db) {
  const run = db.prepare(`SELECT r.id FROM research_runs r JOIN mandates m ON m.id = r.mandate_id
    WHERE r.status = 'queued'
    ORDER BY (SELECT MAX(r2.started_at) FROM research_runs r2 JOIN mandates m2 ON m2.id = r2.mandate_id
              WHERE m2.owner_id IS m.owner_id) ASC NULLS FIRST, r.id ASC
    LIMIT 1`).get();
  if (run) return { kind: 'run', id: run.id };
  const search = db.prepare("SELECT id FROM contact_searches WHERE status = 'queued' ORDER BY id LIMIT 1").get();
  if (search) return { kind: 'contacts', id: search.id };
  const calibration = db.prepare("SELECT id FROM calibrations WHERE status = 'queued' ORDER BY id LIMIT 1").get();
  return calibration ? { kind: 'calibration', id: calibration.id } : null;
}

/** Process one queued item. Returns false when the queue is empty. */
export async function processNext(db, ai, now = new Date()) {
  const item = nextItem(db);
  if (!item) return false;
  if (item.kind === 'run') await executeRun(db, ai, item.id, now);
  else if (item.kind === 'contacts') await executeContactSearch(db, ai, item.id, now);
  else await executeCalibration(db, ai, item.id, now);
  return true;
}

/** Start the in-process worker. Returns a stop function (used by tests and shutdown). */
export function startResearchWorker(db, ai, { pollMs = 5000, scheduleMs = 10 * 60 * 1000 } = {}) {
  recoverInterrupted(db);
  let busy = false;
  const poll = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      while (await processNext(db, ai)) { /* drain the queue one item at a time */ }
    } catch (error) {
      // executeRun/executeCalibration record their own failures; reaching here means a bug: log it and keep serving.
      console.error('Research worker error:', error);
      audit(db, null, 'research.worker_error', 'research_runs', null, String(error.message));
    } finally {
      busy = false;
    }
  }, pollMs);
  const schedule = setInterval(() => {
    scheduleWeeklyRuns(db);
    requeueWaiting(db);
  }, scheduleMs);
  scheduleWeeklyRuns(db);
  return () => {
    clearInterval(poll);
    clearInterval(schedule);
  };
}
