// Environment-derived configuration shared by the server and CLI scripts.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath } from './db.js';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') throw new Error(`Environment variable ${name} is required`);
  return value;
}

export function configuredDbPath() {
  return resolveDbPath(path.resolve(repoRoot, requireEnv('DATA_DIR', './data')));
}
