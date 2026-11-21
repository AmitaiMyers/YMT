// Provider-agnostic AI service: picks the provider and model per task from settings, enforces the monthly cost
// cap before every call, and records what each call cost. Providers implement one method:
//   run({ model, system, prompt, tool: { name, description, schema }, webSearch: { maxUses } | null, maxTokens })
//     → { input: object, sources: [{ url, title }], usage: { input, output, cacheRead, cacheWrite, searches } }

import { AI_PROVIDERS, AI_TASKS } from '../constants.js';
import { getNumericSetting, insert, audit } from '../db.js';

export class AiError extends Error {}
export class AiConfigError extends AiError {}
export class BudgetError extends AiError {}

// Rough input size of one call, used only for the pre-call estimate (the real cost is recorded afterwards).
const ESTIMATED_INPUT_TOKENS = 60000;
const CACHE_WRITE_FACTOR = 1.25;

function readJsonSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) throw new Error(`Missing setting: ${key}`);
  return JSON.parse(row.value);
}

export function taskConfig(db, task) {
  if (!AI_TASKS.includes(task)) throw new Error(`Unknown AI task: ${task}`);
  const tasks = readJsonSetting(db, 'ai_tasks');
  const config = tasks[task];
  if (!config || !AI_PROVIDERS.includes(config.provider) || typeof config.model !== 'string') {
    throw new AiConfigError(`Settings ai_tasks.${task} must name a provider and a model`);
  }
  return config;
}

export function priceFor(db, model) {
  const prices = readJsonSetting(db, 'ai_prices');
  const price = prices[model];
  if (!price) throw new AiConfigError(`No price for model "${model}". An admin must add it under Research → AI settings before it can be used.`);
  for (const key of ['input', 'output', 'cache_read', 'search']) {
    if (typeof price[key] !== 'number' || price[key] < 0) throw new AiConfigError(`Price "${key}" for ${model} must be a non-negative number`);
  }
  return price;
}

export function costOf(price, usage) {
  const tokens = usage.input * price.input + usage.output * price.output + usage.cacheRead * price.cache_read
    + usage.cacheWrite * price.input * CACHE_WRITE_FACTOR;
  return tokens / 1_000_000 + usage.searches * price.search;
}

function monthStartIso(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function spentThisMonth(db, now = new Date()) {
  return db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage WHERE created_at >= ?').get(monthStartIso(now)).total;
}

/** Spend vs cap for the current month, for screens and the 80% alert. */
export function budgetStatus(db, now = new Date()) {
  const cap = getNumericSetting(db, 'ai_monthly_cap_usd');
  const spent = spentThisMonth(db, now);
  return { cap, spent, remaining: Math.max(0, cap - spent), month: now.toISOString().slice(0, 7), ratio: cap > 0 ? spent / cap : 1 };
}

function noteAlert(db, now) {
  const status = budgetStatus(db, now);
  if (status.ratio < 0.8) return;
  const alerted = db.prepare("SELECT value FROM settings WHERE key = 'ai_alert_month'").get().value;
  if (alerted === status.month) return;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'ai_alert_month'").run(status.month);
  audit(db, null, 'ai.budget_80_percent', 'settings', null, `${status.spent.toFixed(2)} of ${status.cap} USD`);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Partial<Record<'claude' | 'openai' | 'fake', { run: Function }>>} providers configured providers only
 */
export function createAiService(db, providers) {
  /** Why the task cannot run now (no API key for its provider, or no price for its model), or null when ready. */
  function problem(task) {
    const { provider, model } = taskConfig(db, task);
    if (!providers[provider]) {
      const variable = provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      return `AI provider "${provider}" is not configured for "${task}": set ${variable} on the server.`;
    }
    if (!readJsonSetting(db, 'ai_prices')[model]) return `No price for model "${model}". An admin must add it in AI settings.`;
    return null;
  }

  function assertReady(task) {
    const message = problem(task);
    if (message) throw new AiConfigError(message);
  }

  async function call(task, request, { runId = null, calibrationId = null, now = new Date() } = {}) {
    assertReady(task);
    const { provider, model } = taskConfig(db, task);
    const price = priceFor(db, model);
    const estimate = costOf(price, { input: ESTIMATED_INPUT_TOKENS, output: request.maxTokens, cacheRead: 0, cacheWrite: 0, searches: request.webSearch ? request.webSearch.maxUses : 0 });
    const { cap, spent } = budgetStatus(db, now);
    if (spent + estimate > cap) {
      noteAlert(db, now);
      throw new BudgetError(`Monthly AI cap reached (${spent.toFixed(2)} of ${cap} USD spent; this step may cost up to ${estimate.toFixed(2)} USD).`);
    }
    const result = await providers[provider].run({ model, ...request });
    const costUsd = costOf(price, result.usage);
    insert(db, 'ai_usage', {
      run_id: runId, calibration_id: calibrationId, task, provider, model,
      input_tokens: result.usage.input, output_tokens: result.usage.output, cache_read_tokens: result.usage.cacheRead,
      web_searches: result.usage.searches, cost_usd: costUsd,
    });
    noteAlert(db, now);
    return { ...result, costUsd, provider, model };
  }

  return { call, assertReady, problem, configuredProviders: () => Object.keys(providers) };
}
