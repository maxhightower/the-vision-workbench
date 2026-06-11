/**
 * Model provider adapters. Each adapter is an async generator that yields
 * text chunks, so workstream processes can stream regardless of provider.
 *
 * Supported in V1:
 *   - openai-compatible : any /chat/completions endpoint (OpenAI, vLLM, LM Studio…)
 *   - anthropic         : the Anthropic Messages API
 *   - ollama            : local Ollama
 *   - offline           : no provider; produces a structured fill-in template
 *                         so the full loop still works without any API.
 */

class ProviderError extends Error {}

async function* parseSseStream(response, extractText) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete tail
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const text = extractText(json);
      if (text) yield text;
    }
  }
}

async function assertOk(response, providerName) {
  if (response.ok) return;
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 400);
  } catch {
    // ignore
  }
  throw new ProviderError(`${providerName} request failed (${response.status}): ${detail}`);
}

async function* streamOpenAiCompatible(config, { system, prompt }, signal) {
  const baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) throw new ProviderError('OpenAI-compatible provider has no base URL configured.');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  await assertOk(response, 'OpenAI-compatible');
  yield* parseSseStream(response, (json) => json.choices?.[0]?.delta?.content);
}

async function* streamAnthropic(config, { system, prompt }, signal) {
  if (!config.apiKey) throw new ProviderError('Anthropic provider has no API key configured.');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      stream: true,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  await assertOk(response, 'Anthropic');
  yield* parseSseStream(response, (json) =>
    json.type === 'content_block_delta' ? json.delta?.text : null
  );
}

async function* streamOllama(config, { system, prompt }, signal) {
  const baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  await assertOk(response, 'Ollama');
  // Ollama streams newline-delimited JSON.
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let json;
      try {
        json = JSON.parse(line);
      } catch {
        continue;
      }
      if (json.message?.content) yield json.message.content;
      if (json.done) return;
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Offline mode: no model calls. Emits the workstream's fill-in template so a
 * user with no provider can still run the loop and edit/save the result.
 */
async function* streamOffline(_config, { offlineTemplate, workstreamName }, signal) {
  const text =
    `> **Offline mode** — no model provider is configured in the Tool Shed.\n` +
    `> Workbench generated this ${workstreamName} template for you to fill in by hand.\n` +
    `> Configure a provider in the Tool Shed to have this generated automatically.\n\n` +
    (offlineTemplate || 'No template available for this workstream.\n');
  // Stream in small pieces so the UI behaves the same as with a real provider.
  for (const piece of text.match(/[\s\S]{1,48}/g) || []) {
    if (signal?.aborted) return;
    yield piece;
    await sleep(15);
  }
}

const ADAPTERS = {
  'openai-compatible': streamOpenAiCompatible,
  anthropic: streamAnthropic,
  ollama: streamOllama,
  offline: streamOffline,
};

/**
 * Stream a completion through the active provider in the tool shed.
 * @returns async generator of text chunks
 */
export function streamCompletion(toolShed, request, signal) {
  const providerId = toolShed.activeProvider || 'offline';
  const adapter = ADAPTERS[providerId];
  if (!adapter) throw new ProviderError(`Unknown provider: ${providerId}`);
  return adapter(toolShed.providers[providerId] || {}, request, signal);
}

export { ProviderError };
