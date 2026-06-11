import { api } from '../api.js';
import { toast } from '../app.js';
import { escapeHtml } from '../md.js';

const PROVIDER_FIELDS = {
  'openai-compatible': [
    { key: 'baseUrl', label: 'Base URL', type: 'url', hint: 'e.g. https://api.openai.com/v1, or your vLLM / LM Studio endpoint' },
    { key: 'apiKey', label: 'API key', type: 'password' },
    { key: 'model', label: 'Model', type: 'text' },
  ],
  anthropic: [
    { key: 'apiKey', label: 'API key', type: 'password' },
    { key: 'model', label: 'Model', type: 'text', hint: 'e.g. claude-sonnet-4-6' },
  ],
  ollama: [
    { key: 'baseUrl', label: 'Base URL', type: 'url', hint: 'default http://localhost:11434' },
    { key: 'model', label: 'Model', type: 'text', hint: 'a model you have pulled, e.g. llama3.1' },
  ],
  offline: [],
};

export async function renderToolShed(app) {
  const shed = await api.toolShed();

  app.innerHTML = `
    <h1>Tool Shed</h1>
    <p class="subtitle">Configure the model providers and tools your workstreams run through.
    Settings are stored in <code>tool_shed.json</code> in your Workbench home.</p>

    <div class="shed-section" id="providers"></div>

    <div class="shed-section">
      <h2>Tools</h2>
      <div class="card">
        <label style="margin:0;display:flex;gap:10px;align-items:center;cursor:pointer">
          <input type="checkbox" id="tool-search" style="width:auto" ${shed.tools.search?.enabled ? 'checked' : ''} />
          <span><strong>Web search</strong> <span class="muted">— enables the Market Scan workstream.
          (V1 runs Market Scan from model knowledge; live search integration comes later.)</span></span>
        </label>
      </div>
    </div>

    <button class="btn-primary" id="shed-save">Save Tool Shed</button>`;

  const providersEl = app.querySelector('#providers');
  providersEl.innerHTML =
    '<h2>Model provider</h2>' +
    Object.entries(shed.providers)
      .map(([id, provider]) => providerCard(id, provider, shed.activeProvider === id))
      .join('');

  // Selecting a radio highlights its card.
  providersEl.querySelectorAll('input[name=active]').forEach((radio) =>
    radio.addEventListener('change', () => {
      providersEl.querySelectorAll('.provider-card').forEach((card) =>
        card.classList.toggle('active', card.querySelector('input[name=active]').checked)
      );
    })
  );

  app.querySelector('#shed-save').addEventListener('click', async () => {
    const config = {
      activeProvider: providersEl.querySelector('input[name=active]:checked')?.value || 'offline',
      providers: {},
      tools: { search: { enabled: app.querySelector('#tool-search').checked } },
    };
    for (const [id, fields] of Object.entries(PROVIDER_FIELDS)) {
      config.providers[id] = {};
      for (const field of fields) {
        const input = providersEl.querySelector(`[data-provider="${id}"][data-key="${field.key}"]`);
        if (input) config.providers[id][field.key] = input.value;
      }
    }
    try {
      await api.saveToolShed(config);
      toast('Tool Shed saved.');
    } catch (err) {
      toast(err.message, true);
    }
  });
}

function providerCard(id, provider, isActive) {
  const fields = PROVIDER_FIELDS[id] || [];
  const offlineNote =
    id === 'offline'
      ? `<p class="muted" style="margin:8px 0 0">No API calls. Workstreams produce structured
         fill-in templates so the full loop still works — just without generation.</p>`
      : '';
  return `
    <div class="card provider-card ${isActive ? 'active' : ''}">
      <label style="margin:0;display:flex;gap:10px;align-items:center;cursor:pointer;font-size:15px;color:var(--text)">
        <input type="radio" name="active" value="${id}" style="width:auto" ${isActive ? 'checked' : ''} />
        <strong>${escapeHtml(provider.label || id)}</strong>
        ${provider.hasApiKey ? '<span class="badge completed">key set</span>' : ''}
      </label>
      ${offlineNote}
      <div class="provider-fields">
        ${fields
          .map(
            (f) => `
          <div>
            <label>${f.label}${f.hint ? ` <span class="faint">· ${f.hint}</span>` : ''}</label>
            <input type="${f.type}" data-provider="${id}" data-key="${f.key}"
                   value="${escapeHtml(provider[f.key] || '')}"
                   ${f.type === 'password' ? 'autocomplete="off" placeholder="' + (provider.hasApiKey ? 'unchanged' : 'not set') + '"' : ''} />
          </div>`
          )
          .join('')}
      </div>
    </div>`;
}
