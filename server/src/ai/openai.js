// OpenAI adapter (Responses API over HTTPS, no SDK dependency). Same contract as the Claude adapter: web search,
// then a function call carrying the structured result. Prices for OpenAI models must be added in AI settings.
// NOTE: written against OpenAI's documented Responses API; verify with a real key before relying on it.

import { AiError } from './service.js';
import { normalizeUrl } from '../research/classification.js';

const ENDPOINT = 'https://api.openai.com/v1/responses';

function addUsage(total, data) {
  const cached = data.usage.input_tokens_details ? data.usage.input_tokens_details.cached_tokens : 0;
  total.input += data.usage.input_tokens - cached; // OpenAI counts cached tokens inside input_tokens
  total.cacheRead += cached;
  total.output += data.usage.output_tokens;
  total.searches += data.output.filter((item) => item.type === 'web_search_call').length;
}

function collectSources(found, data) {
  for (const item of data.output) {
    if (item.type === 'web_search_call' && item.action && Array.isArray(item.action.sources)) {
      for (const source of item.action.sources) found.set(normalizeUrl(source.url), { url: source.url, title: source.title ?? null });
    }
    if (item.type === 'message') {
      for (const part of item.content) {
        for (const note of part.annotations ?? []) {
          if (note.type === 'url_citation') found.set(normalizeUrl(note.url), { url: note.url, title: note.title ?? null });
        }
      }
    }
  }
}

/** @param {{ apiKey: string, fetchImpl?: typeof fetch }} options */
export function createOpenAiProvider({ apiKey, fetchImpl = fetch }) {
  async function post(body) {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new AiError(`OpenAI error ${response.status}: ${data.error ? data.error.message : 'no message'}`);
    return data;
  }

  async function run({ model, system, prompt, tool, webSearch, maxTokens }) {
    const tools = [{ type: 'function', name: tool.name, description: tool.description, parameters: tool.schema }];
    if (webSearch) tools.unshift({ type: 'web_search' });
    const base = { model, tools, max_output_tokens: maxTokens, ...(webSearch ? { include: ['web_search_call.action.sources'] } : {}) };

    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 };
    const sources = new Map();
    let data = await post({ ...base, instructions: system, input: prompt });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      addUsage(usage, data);
      collectSources(sources, data);
      const call = data.output.find((item) => item.type === 'function_call' && item.name === tool.name);
      if (call) {
        if (typeof call.arguments !== 'string') throw new AiError('OpenAI returned a function call without arguments');
        return { input: JSON.parse(call.arguments), sources: [...sources.values()], usage };
      }
      if (attempt === 1) break;
      data = await post({ ...base, previous_response_id: data.id, input: `Submit your result now by calling the ${tool.name} function.` });
    }
    throw new AiError(`OpenAI finished without calling ${tool.name}`);
  }

  return { run };
}
