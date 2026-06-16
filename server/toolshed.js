import fs from 'node:fs';
import path from 'node:path';
import { WORKBENCH_HOME } from './config.js';

/**
 * The Tool Shed: global configuration for model providers and tools.
 * Stored as a single human-readable file at <WORKBENCH_HOME>/tool_shed.json.
 */

const TOOL_SHED_FILE = path.join(WORKBENCH_HOME, 'tool_shed.json');

const DEFAULTS = {
  activeProvider: 'offline',
  providers: {
    'openai-compatible': {
      label: 'OpenAI-compatible API',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
    },
    anthropic: {
      label: 'Anthropic API',
      apiKey: '',
      model: 'claude-sonnet-4-6',
    },
    ollama: {
      label: 'Ollama (local)',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1',
      embeddingModel: 'nomic-embed-text',
    },
    offline: {
      label: 'Offline (no provider)',
    },
  },
  tools: {
    search: {
      label: 'Web search (enables Market Scan)',
      enabled: false,
    },
  },
};

export function readToolShed() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(TOOL_SHED_FILE, 'utf8'));
  } catch {
    // first run: defaults only
  }
  // Deep-ish merge so new defaults appear for existing installs.
  const merged = {
    ...DEFAULTS,
    ...saved,
    providers: { ...DEFAULTS.providers },
    tools: { ...DEFAULTS.tools },
  };
  for (const [key, value] of Object.entries(saved.providers || {})) {
    merged.providers[key] = { ...DEFAULTS.providers[key], ...value };
  }
  for (const [key, value] of Object.entries(saved.tools || {})) {
    merged.tools[key] = { ...DEFAULTS.tools[key], ...value };
  }
  return merged;
}

export function writeToolShed(config) {
  const current = readToolShed();
  const next = {
    activeProvider: config.activeProvider || current.activeProvider,
    providers: { ...current.providers },
    tools: { ...current.tools },
  };
  for (const [key, value] of Object.entries(config.providers || {})) {
    next.providers[key] = { ...current.providers[key], ...value };
    // Masked keys come back from the UI as '•••' — keep the stored secret.
    if (typeof next.providers[key].apiKey === 'string' && /^•+$/.test(next.providers[key].apiKey)) {
      next.providers[key].apiKey = current.providers[key]?.apiKey || '';
    }
  }
  for (const [key, value] of Object.entries(config.tools || {})) {
    next.tools[key] = { ...current.tools[key], ...value };
  }
  if (!next.providers[next.activeProvider]) next.activeProvider = 'offline';
  fs.mkdirSync(WORKBENCH_HOME, { recursive: true });
  fs.writeFileSync(TOOL_SHED_FILE, JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** Public view: never send API keys to the browser, only whether one is set. */
export function maskToolShed(config) {
  const masked = JSON.parse(JSON.stringify(config));
  for (const provider of Object.values(masked.providers)) {
    if ('apiKey' in provider) {
      provider.hasApiKey = Boolean(provider.apiKey);
      provider.apiKey = provider.apiKey ? '••••••••' : '';
    }
  }
  return masked;
}

export function isSearchConfigured(config) {
  return Boolean(config.tools?.search?.enabled);
}

/** Whether the active provider can produce embeddings (for auto-mapping). */
export function isEmbeddingConfigured(config) {
  return ['ollama', 'openai-compatible'].includes(config.activeProvider);
}
