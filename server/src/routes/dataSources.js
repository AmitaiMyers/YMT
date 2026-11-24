// Apollo and Lusha (Settings → Data sources): keys (admins), company search into a watch list, decision makers on a card.

import { Router } from 'express';
import { parseBody, parseId, parseOptionalEnum } from '../validate.js';
import { insert, findById, audit, transaction } from '../db.js';
import { badRequest, notFound } from '../http.js';
import { requireAdmin } from '../auth.js';
import { importEntries } from '../research/watchLists.js';
import { proposeContacts } from '../research/runner.js';
import { contactKeywordsFor } from '../research/spec.js';
import { businessEmail, linkedinProfile } from '../research/tasks.js';
import { assertCanSee } from '../research/access.js';
import {
  DATA_SOURCES, MAX_COMPANIES, MAX_CONTACTS, dataSourceStatus, saveDataSourceKey, removeDataSourceKey, dataSourceClient, domainOf,
} from '../dataSources.js';

const KEY_SPEC = { api_key: { type: 'string', required: true, max: 300 } };
const COMPANY_SEARCH_SPEC = {
  list_id: { type: 'id' },
  list_name: { type: 'string', max: 120 },
  countries: { type: 'string', required: true, max: 300 },   // comma-separated, e.g. "Israel"
  keywords: { type: 'string', max: 300 },                     // comma-separated
  employees_min: { type: 'int', min: 1 },
  employees_max: { type: 'int', min: 1 },
  limit: { type: 'int', required: true, min: 1, max: MAX_COMPANIES },
};
const CONTACT_SEARCH_SPEC = { limit: { type: 'int', min: 1, max: MAX_CONTACTS } };
const LABELS = { apollo: 'Apollo', lusha: 'Lusha' };

function splitList(text) {
  return text === null ? [] : text.split(',').map((item) => item.trim()).filter(Boolean);
}

function providerOf(req) {
  const provider = parseOptionalEnum(req.params.provider, 'provider', DATA_SOURCES);
  if (provider === null) throw notFound('Unknown data source');
  return provider;
}

/** @param {{ fetchImpl?: typeof fetch }} deps tests pass a fake fetch */
export function dataSourceRoutes(db, { fetchImpl = fetch } = {}) {
  const router = Router();

  router.get('/data-sources', (req, res) => res.json(dataSourceStatus(db)));

  router.put('/data-sources/:provider', requireAdmin, (req, res) => {
    const provider = providerOf(req);
    const { api_key: apiKey } = parseBody(KEY_SPEC, req.body);
    saveDataSourceKey(db, provider, apiKey.trim(), req.user.id);
    audit(db, req.user.id, 'data_source.key_saved', 'data_source_keys', null, provider);
    res.json(dataSourceStatus(db));
  });

  router.delete('/data-sources/:provider', requireAdmin, (req, res) => {
    const provider = providerOf(req);
    removeDataSourceKey(db, provider);
    audit(db, req.user.id, 'data_source.key_removed', 'data_source_keys', null, provider);
    res.json(dataSourceStatus(db));
  });

  /** Companies from Apollo or Lusha into a watch list (new or existing); duplicates in the list are skipped. */
  router.post('/data-sources/:provider/companies', async (req, res) => {
    const provider = providerOf(req);
    const values = parseBody(COMPANY_SEARCH_SPEC, req.body);
    if ((values.list_id === null) === (values.list_name === null)) throw badRequest('Give either list_id (add to a list) or list_name (new list)');
    if (values.employees_min !== null && values.employees_max !== null && values.employees_min > values.employees_max) throw badRequest('employees_min is above employees_max');
    const countries = splitList(values.countries);
    if (countries.length === 0) throw badRequest('countries is required');
    if (values.list_id !== null) findById(db, 'watch_lists', values.list_id);
    const companies = await dataSourceClient(db, provider, fetchImpl).searchCompanies({
      countries, keywords: splitList(values.keywords), employeesMin: values.employees_min, employeesMax: values.employees_max, limit: values.limit,
    });
    const entries = companies.filter((company) => company.name)
      .map((company) => ({ ...company, website: domainOf(company.website) ? company.website : null }));
    const result = transaction(db, () => {
      const listId = values.list_id ?? insert(db, 'watch_lists', {
        name: values.list_name, source_note: `${LABELS[provider]} company search: ${[values.countries, values.keywords].filter(Boolean).join(' · ')}`, created_by: req.user.id,
      });
      return { list_id: listId, found: entries.length, ...importEntries(db, listId, entries) };
    });
    audit(db, req.user.id, 'data_source.companies', 'watch_lists', result.list_id, `${provider}: ${result.found} found, ${result.added} added`);
    res.status(201).json(result);
  });

  /** Decision makers for a card from Apollo or Lusha, as proposals the owner confirms (like the agent's own search). */
  router.post('/opportunities/:id/contacts-from/:provider', async (req, res) => {
    const provider = providerOf(req);
    const opportunity = findById(db, 'opportunities', parseId(req.params.id));
    assertCanSee(req.user, opportunity);
    const { limit } = parseBody(CONTACT_SEARCH_SPEC, req.body);
    const company = findById(db, 'companies', opportunity.company_id);
    const domain = domainOf(company.website);
    if (domain === null) throw badRequest('Add the company\'s website first: the search looks people up by the company\'s domain');
    const mandate = opportunity.mandate_id ? findById(db, 'mandates', opportunity.mandate_id) : null;
    const people = await dataSourceClient(db, provider, fetchImpl).findContacts({
      domain, titles: contactKeywordsFor(mandate ? mandate.code : null), limit: limit ?? MAX_CONTACTS,
    });
    const proposals = people.filter((person) => person.fullName).map((person) => ({
      fullName: person.fullName,
      jobTitle: person.jobTitle,
      email: businessEmail(person.email),
      linkedinUrl: linkedinProfile(person.linkedinUrl),
      sourceUrl: linkedinProfile(person.sourceUrl) ?? person.sourceUrl,
      quote: `${LABELS[provider]}: ${person.fullName}${person.jobTitle ? `, ${person.jobTitle}` : ''} at ${company.name}`,
    }));
    const added = transaction(db, () => proposeContacts(db, opportunity, proposals, 'list'));
    audit(db, req.user.id, 'data_source.contacts', 'opportunities', opportunity.id, `${provider}: ${people.length} found, ${added} added`);
    res.status(201).json({ found: people.length, added });
  });

  return router;
}
