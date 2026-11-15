// Build-time guard: every translation key used in the code exists in BOTH Hebrew and English,
// and both dictionaries cover the same keys. Fails the build with a clear list otherwise.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS } from '../src/i18n/strings.js';
import * as enums from '../../shared/enums.js';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

// Keys built dynamically as `${prefix}.${value}` from a shared enum.
const DYNAMIC_KEYS = {
  stage: enums.PIPELINE_STAGES, dealStatus: enums.DEAL_STATUSES, dealModel: enums.DEAL_MODELS, indiaActivity: enums.INDIA_ACTIVITY,
  language: enums.LANGUAGES, department: enums.DEPARTMENTS, triggerType: enums.TRIGGER_TYPES, channel: enums.CHANNELS,
  direction: enums.DIRECTIONS, resourceType: enums.RESOURCE_TYPES, documentKind: enums.DOCUMENT_KINDS, documentStatus: enums.DOCUMENT_STATUSES,
  templateKind: enums.TEMPLATE_KINDS, approvalKind: enums.APPROVAL_KINDS, approvalStatus: enums.APPROVAL_STATUSES,
  meetingStatus: ['scheduled', 'done', 'cancelled'], role: ['admin', 'member'], share: ['active', 'expired', 'revoked'],
  companyTab: ['overview', 'contacts', 'triggers', 'pipeline', 'meetings', 'documents', 'matches', 'sharing'],
  privacy: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
};

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(jsx?|tsx?)$/.test(name) ? [full] : [];
  });
}

const usedKeys = new Set();
for (const file of sourceFiles(srcDir)) {
  for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) usedKeys.add(match[1]);
}
for (const [prefix, values] of Object.entries(DYNAMIC_KEYS)) values.forEach((value) => usedKeys.add(`${prefix}.${value}`));

const problems = [];
for (const language of Object.keys(STRINGS)) {
  for (const key of usedKeys) if (!(key in STRINGS[language])) problems.push(`[${language}] missing "${key}"`);
}
const he = Object.keys(STRINGS.he);
const en = Object.keys(STRINGS.en);
he.filter((key) => !en.includes(key)).forEach((key) => problems.push(`[en] missing "${key}" (exists in he)`));
en.filter((key) => !he.includes(key)).forEach((key) => problems.push(`[he] missing "${key}" (exists in en)`));

if (problems.length > 0) {
  console.error(`i18n check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`i18n check passed: ${usedKeys.size} keys used, ${he.length} keys per language.`);
