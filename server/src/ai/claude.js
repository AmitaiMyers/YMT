// Claude adapter (official Anthropic SDK). Web search runs on Anthropic's servers; the result is returned through a
// "submit" tool whose input the server validates. Tool choice stays "auto" (current models reject forced tool use),
// so the adapter reminds the model once if it ends without calling the tool.

import { AiError } from './service.js';
import { normalizeUrl } from '../research/classification.js';

// Models that accept the server-side refusal fallback (fallbacks: "default").
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-fable-5-2']);
// Models that support the web search version with dynamic filtering; others use the basic version.
const DYNAMIC_SEARCH_MODEL = /^claude-(fable|mythos|opus-5|opus-4-[678]|sonnet-5|sonnet-4-6)/;
const MAX_TURNS = 6; // pause_turn continuations plus one reminder

function addUsage(total, usage) {
  total.input += usage.input_tokens;
  total.output += usage.output_tokens;
  total.cacheRead += usage.cache_read_input_tokens ?? 0;
  total.cacheWrite += usage.cache_creation_input_tokens ?? 0;
  total.searches += usage.server_tool_use ? usage.server_tool_use.web_search_requests : 0;
}

/** Every URL the search actually returned or cited: the only URLs a result may use as evidence. */
function collectSources(found, content) {
  for (const block of content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result.type === 'web_search_result') found.set(normalizeUrl(result.url), { url: result.url, title: result.title });
      }
    }
    if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const citation of block.citations) {
        if (citation.url) found.set(normalizeUrl(citation.url), { url: citation.url, title: citation.title });
      }
    }
  }
}

/** @param {{ client: import('@anthropic-ai/sdk').default }} options */
export function createClaudeProvider({ client }) {
  async function run({ model, system, prompt, tool, webSearch, maxTokens }) {
    const tools = [];
    if (webSearch) {
      tools.push({ type: DYNAMIC_SEARCH_MODEL.test(model) ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: webSearch.maxUses });
    }
    tools.push({ name: tool.name, description: tool.description, input_schema: tool.schema });

    const messages = [{ role: 'user', content: prompt }];
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 };
    const sources = new Map();
    let reminded = false;

    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const params = { model, max_tokens: maxTokens, system, tools, messages, output_config: { effort: 'medium' } };
      const response = FALLBACK_MODELS.has(model)
        ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.beta.messages.create(params);
      addUsage(usage, response.usage);
      collectSources(sources, response.content);

      if (response.stop_reason === 'refusal') {
        const category = response.stop_details ? response.stop_details.category : null;
        throw new AiError(`Claude declined the request${category ? ` (${category})` : ''}`);
      }
      if (response.stop_reason === 'max_tokens') throw new AiError(`Claude ran out of output tokens (${maxTokens}) before submitting a result`);

      const submitted = response.content.find((block) => block.type === 'tool_use' && block.name === tool.name);
      if (submitted) return { input: submitted.input, sources: [...sources.values()], usage };

      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'pause_turn') continue; // server-side search loop paused: resend to resume
      if (reminded) throw new AiError(`Claude finished without calling ${tool.name}`);
      messages.push({ role: 'user', content: `Submit your result now by calling the ${tool.name} tool.` });
      reminded = true;
    }
    throw new AiError(`Claude gave no result after ${MAX_TURNS} turns`);
  }

  return { run };
}
