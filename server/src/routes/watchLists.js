// Watch lists (imported company lists). Any staff member can import; the creator or an admin can delete.

import { Router } from 'express';
import { parseBody, parseId } from '../validate.js';
import { insert, findById, audit, transaction } from '../db.js';
import { badRequest, forbidden, HttpError } from '../http.js';
import { normalizeDomain } from '../research/classification.js';
import { importEntries, MAX_IMPORT_ROWS } from '../research/watchLists.js';

const LIST_SPEC = {
  name: { type: 'string', required: true, max: 120 },
  source_url: { type: 'url' },
  source_note: { type: 'text', max: 500 },
};
const ENTRY_SPEC = {
  name: { type: 'string', required: true, max: 200 },
  website: { type: 'string', max: 300 },
  country: { type: 'string', max: 100 },
  notes: { type: 'string', max: 300 },
};

/** Validate imported rows; the error names the row (1-based, as in the file after its header). */
function parseEntries(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw badRequest('entries must be a non-empty list');
  if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`At most ${MAX_IMPORT_ROWS} companies per import`);
  return rows.map((row, index) => {
    let entry;
    try {
      entry = parseBody(ENTRY_SPEC, row);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      throw badRequest(`Row ${index + 1}: ${error.message}`); // add the row number, keep the reason
    }
    if (entry.website !== null && normalizeDomain(entry.website) === null) throw badRequest(`Row ${index + 1}: website "${entry.website}" is not a web address`);
    return entry;
  });
}

function splitBody(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest('Request body must be a JSON object');
  const { entries, ...rest } = body;
  return { entries: parseEntries(entries), rest };
}

export function watchListRoutes(db) {
  const router = Router();

  router.get('/watch-lists', (req, res) => {
    res.json(db.prepare(`SELECT w.*, u.display_name AS created_by_name,
        (SELECT COUNT(*) FROM watch_list_entries e WHERE e.list_id = w.id) AS entry_count,
        (SELECT COUNT(DISTINCT c.entry_id) FROM watch_checks c JOIN watch_list_entries e ON e.id = c.entry_id WHERE e.list_id = w.id) AS checked_count,
        (SELECT COUNT(*) FROM opportunities o JOIN research_runs r ON r.id = o.run_id WHERE r.watch_list_id = w.id) AS cards_found
      FROM watch_lists w LEFT JOIN users u ON u.id = w.created_by ORDER BY w.id DESC`).all());
  });

  router.get('/watch-lists/:id', (req, res) => {
    const list = findById(db, 'watch_lists', parseId(req.params.id));
    const entries = db.prepare(`SELECT e.id, e.name, e.website, e.country, e.notes, MAX(c.last_checked_at) AS last_checked_at
      FROM watch_list_entries e LEFT JOIN watch_checks c ON c.entry_id = e.id
      WHERE e.list_id = ? GROUP BY e.id ORDER BY e.name LIMIT ${MAX_IMPORT_ROWS}`).all(list.id);
    res.json({ ...list, entries });
  });

  router.post('/watch-lists', (req, res) => {
    const { entries, rest } = splitBody(req.body);
    const values = parseBody(LIST_SPEC, rest);
    const result = transaction(db, () => {
      const id = insert(db, 'watch_lists', { ...values, created_by: req.user.id });
      return { id, ...importEntries(db, id, entries) };
    });
    audit(db, req.user.id, 'watch_list.created', 'watch_lists', result.id, `${values.name}: ${result.added} added`);
    res.status(201).json(result);
  });

  router.post('/watch-lists/:id/import', (req, res) => {
    const list = findById(db, 'watch_lists', parseId(req.params.id));
    const { entries, rest } = splitBody(req.body);
    if (Object.keys(rest).length > 0) throw badRequest(`Unknown field(s): ${Object.keys(rest).join(', ')}`);
    const result = transaction(db, () => importEntries(db, list.id, entries));
    audit(db, req.user.id, 'watch_list.imported', 'watch_lists', list.id, `${result.added} added`);
    res.json(result);
  });

  router.delete('/watch-lists/:id', (req, res) => {
    const list = findById(db, 'watch_lists', parseId(req.params.id));
    if (req.user.role !== 'admin' && list.created_by !== req.user.id) throw forbidden('Only the person who imported the list or an admin can delete it');
    db.prepare('DELETE FROM watch_lists WHERE id = ?').run(list.id);
    audit(db, req.user.id, 'watch_list.deleted', 'watch_lists', list.id, list.name);
    res.json({ ok: true });
  });

  return router;
}
