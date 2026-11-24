// Apollo and Lusha: find companies (into a watch list) and decision makers (as proposals on a research card).
// Request and response formats follow the providers' API references (docs.apollo.io, docs.lusha.com, read 25.11.2026).
// Both charge credits on the YMT account: Apollo 1 credit per company-search page and per revealed person; Lusha per
// search result and per revealed contact. API keys are stored server-side and never sent to the browser.

import { conflict, HttpError } from './http.js';
import { nowIso } from './db.js';
import { DATA_SOURCES } from './constants.js';

export { DATA_SOURCES };
export const MAX_COMPANIES = 100;
export const MAX_CONTACTS = 5;

const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const LUSHA_BASE = 'https://api.lusha.com';
const LUSHA_MIN_PAGE = 10; // Lusha's page size is 10–100

/** An error from the provider, shown to the user with the provider's own message. */
async function providerError(provider, response) {
  const text = await response.text();
  const detail = text.length > 300 ? `${text.slice(0, 300)}…` : text;
  const reason = response.status === 401 || response.status === 403 ? 'the API key was refused'
    : response.status === 402 ? 'the account is out of credits' : response.status === 429 ? 'too many requests, try again in a minute' : `error ${response.status}`;
  return new HttpError(502, `${provider}: ${reason}${detail ? ` (${detail})` : ''}`);
}

function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(`${key}[]`, String(item)));
    else if (value !== null && value !== undefined) search.append(key, String(value));
  }
  return search.toString();
}

function domainOf(url) {
  if (!url) return null;
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return URL.canParse(withScheme) ? new URL(withScheme).hostname.replace(/^www\./, '').toLowerCase() : null;
}

// ------------------------------------------------------------------ Apollo

export function createApolloClient({ apiKey, fetchImpl = fetch }) {
  async function call(path, params) {
    const response = await fetchImpl(`${APOLLO_BASE}${path}?${queryString(params)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': apiKey },
    });
    if (!response.ok) throw await providerError('Apollo', response);
    return response.json();
  }
  return {
    /** Company search: 1 credit per page (up to 100 companies). */
    async searchCompanies({ countries, keywords, employeesMin, employeesMax, limit }) {
      const data = await call('/mixed_companies/search', {
        organization_locations: countries,
        q_organization_keyword_tags: keywords,
        organization_num_employees_ranges: employeesMin === null && employeesMax === null ? [] : [`${employeesMin ?? 1},${employeesMax ?? 1000000}`],
        page: 1,
        per_page: limit,
      });
      return data.organizations.slice(0, limit).map((org) => ({
        name: org.name,
        website: org.website_url ?? (org.primary_domain ? `https://${org.primary_domain}` : null),
        country: countries.length === 1 ? countries[0] : null,
        notes: 'Apollo company search',
      }));
    },
    /** People search is free but hides emails and last names; each revealed person (people/match) costs a credit. */
    async findContacts({ domain, titles, limit }) {
      const found = await call('/mixed_people/api_search', { q_organization_domains_list: [domain], person_titles: titles, page: 1, per_page: limit });
      const people = [];
      for (const preview of found.people.slice(0, limit)) {
        const { person } = await call('/people/match', { id: preview.id, reveal_personal_emails: false });
        if (!person) continue;
        people.push({
          fullName: person.name ?? [person.first_name, person.last_name].filter(Boolean).join(' '),
          jobTitle: person.title ?? preview.title ?? null,
          email: person.email ?? null,
          linkedinUrl: person.linkedin_url ?? null,
          sourceUrl: person.linkedin_url ?? 'https://app.apollo.io/', // the person's own Apollo page is a #-link, which sources do not keep
        });
      }
      return people;
    },
  };
}

// ------------------------------------------------------------------ Lusha

export function createLushaClient({ apiKey, fetchImpl = fetch }) {
  async function call(path, body) {
    const response = await fetchImpl(`${LUSHA_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', api_key: apiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await providerError('Lusha', response);
    return response.json();
  }
  return {
    /** Company prospecting: charged per result. */
    async searchCompanies({ countries, keywords, employeesMin, employeesMax, limit }) {
      const include = {
        locations: countries.map((country) => ({ country })),
        ...(keywords.length ? { keywords } : {}),
        ...(employeesMin === null && employeesMax === null ? {} : { sizes: [{ ...(employeesMin === null ? {} : { min: employeesMin }), ...(employeesMax === null ? {} : { max: employeesMax }) }] }),
      };
      const data = await call('/v3/companies/prospecting', {
        pagination: { page: 0, size: Math.max(LUSHA_MIN_PAGE, limit) },
        filters: { companies: { include } },
      });
      return data.results.filter((company) => !company.error).slice(0, limit).map((company) => ({
        name: company.name,
        website: company.domain ? `https://${company.domain}` : null,
        country: company.location ? company.location.country ?? null : null,
        notes: ['Lusha company search', company.industry].filter(Boolean).join(' · '),
      }));
    },
    /** Contact prospecting finds people at the company; enrich reveals their work email (credits per contact). */
    async findContacts({ domain, titles, limit }) {
      const found = await call('/v3/contacts/prospecting', {
        pagination: { page: 0, size: LUSHA_MIN_PAGE },
        filters: { contacts: { include: { jobTitles: titles } }, companies: { include: { domains: [domain] } } },
        options: { maxContactsPerCompany: limit },
      });
      const ids = found.results.filter((contact) => !contact.error).slice(0, limit).map((contact) => contact.id);
      if (ids.length === 0) return [];
      const enriched = await call('/v3/contacts/enrich', { ids, reveal: ['emails'] });
      return enriched.results.filter((contact) => !contact.error).map((contact) => {
        const work = (contact.emails ?? []).find((entry) => entry.type === 'work');
        const linkedin = contact.socialLinks ? contact.socialLinks.linkedin ?? null : null;
        return {
          fullName: contact.fullName ?? [contact.firstName, contact.lastName].filter(Boolean).join(' '),
          jobTitle: contact.jobTitle ? contact.jobTitle.title ?? null : null,
          email: work ? work.email : null,
          linkedinUrl: linkedin,
          sourceUrl: linkedin ?? 'https://dashboard.lusha.com/',
        };
      });
    },
  };
}

// ------------------------------------------------------------------ keys and access

const CLIENTS = { apollo: createApolloClient, lusha: createLushaClient };
const LABELS = { apollo: 'Apollo', lusha: 'Lusha' };

/** Which providers have a key, without revealing it (last 4 characters only, to recognise the key). */
export function dataSourceStatus(db) {
  return Object.fromEntries(DATA_SOURCES.map((provider) => {
    const row = db.prepare(`SELECT k.api_key, k.updated_at, u.display_name AS updated_by_name FROM data_source_keys k
      LEFT JOIN users u ON u.id = k.updated_by WHERE k.provider = ?`).get(provider);
    return [provider, row ? { configured: true, key_end: row.api_key.slice(-4), updated_at: row.updated_at, updated_by_name: row.updated_by_name } : { configured: false }];
  }));
}

export function saveDataSourceKey(db, provider, apiKey, userId) {
  db.prepare(`INSERT INTO data_source_keys (provider, api_key, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .run(provider, apiKey, userId, nowIso());
}

export function removeDataSourceKey(db, provider) {
  db.prepare('DELETE FROM data_source_keys WHERE provider = ?').run(provider);
}

/** A client for a provider with a saved key; a clear error when there is none. */
export function dataSourceClient(db, provider, fetchImpl) {
  const row = db.prepare('SELECT api_key FROM data_source_keys WHERE provider = ?').get(provider);
  if (!row) throw conflict(`${LABELS[provider]} is not connected. An admin can add its API key in Settings → Data sources.`);
  return CLIENTS[provider]({ apiKey: row.api_key, fetchImpl });
}

export { domainOf };
