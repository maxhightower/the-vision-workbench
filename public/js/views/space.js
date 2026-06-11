import { api } from '../api.js';
import { renderMarkdown, escapeHtml } from '../md.js';
import { toast, timeAgo } from '../app.js';
import { mountProcessPanel } from './processPanel.js';

/**
 * The Idea Space view: header + tabs (Core radial / Branches / Processes /
 * Outputs). Returns a cleanup function so streams and timers stop on
 * navigation.
 */
export async function renderSpace(app, spaceId, tab) {
  const space = await api.space(spaceId);
  const cleanups = [];

  app.innerHTML = `
    <div class="space-header">
      <h1>${escapeHtml(space.title)}</h1>
      <span class="badge">⎇ ${escapeHtml(space.currentBranch)}</span>
    </div>
    <div class="tabs">
      ${tabLink(spaceId, 'core', 'Core', tab)}
      ${tabLink(spaceId, 'branches', `Branches<span class="count">${space.branches.length}</span>`, tab)}
      ${tabLink(spaceId, 'processes', `Processes${space.runningProcesses ? `<span class="count">${space.runningProcesses}▶</span>` : ''}`, tab)}
      ${tabLink(spaceId, 'outputs', `Outputs<span class="count">${space.outputsCount}</span>`, tab)}
    </div>
    <section id="tab-body"></section>`;

  const body = app.querySelector('#tab-body');
  const render = { core: renderCore, branches: renderBranches, processes: renderProcesses, outputs: renderOutputs }[tab] || renderCore;
  await render(body, space, cleanups);

  return () => cleanups.forEach((fn) => fn());
}

function tabLink(spaceId, key, label, active) {
  return `<a href="#/space/${spaceId}/${key}" class="${key === active ? 'active' : ''}">${label}</a>`;
}

function reload() {
  // Re-run the current route (location.hash unchanged).
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

// ================================================================ Core (radial)

async function renderCore(body, space, cleanups) {
  body.innerHTML = `
    <div class="radial" id="radial">
      <div class="core-card">
        <div class="core-label">
          <span>Current Understanding · ⎇ ${escapeHtml(space.currentBranch)}</span>
          <span class="faint" id="cu-status"></span>
        </div>
        <textarea id="cu-text" spellcheck="false">${escapeHtml(space.understanding)}</textarea>
        <div class="core-foot">
          <span class="faint" title="${escapeHtml(space.seed.slice(0, 400))}">🌱 seeded ${timeAgo(space.createdAt)}</span>
          <button class="btn-small" id="cu-save">Save understanding</button>
        </div>
      </div>
    </div>
    <div id="process-slot"></div>`;

  // --- editable Current Understanding with autosave
  const textEl = body.querySelector('#cu-text');
  const statusEl = body.querySelector('#cu-status');
  let savedValue = space.understanding;
  let saveTimer = null;

  async function save() {
    if (textEl.value === savedValue) return;
    try {
      await api.saveUnderstanding(space.id, textEl.value);
      savedValue = textEl.value;
      statusEl.textContent = 'saved';
      setTimeout(() => { if (statusEl.textContent === 'saved') statusEl.textContent = ''; }, 1500);
    } catch (err) {
      statusEl.textContent = 'save failed';
      toast(err.message, true);
    }
  }
  textEl.addEventListener('input', () => {
    statusEl.textContent = 'editing…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
  });
  textEl.addEventListener('blur', save);
  body.querySelector('#cu-save').addEventListener('click', save);
  cleanups.push(() => { clearTimeout(saveTimer); save(); });

  // --- ghost workstream buttons arranged radially
  const radial = body.querySelector('#radial');
  const slot = body.querySelector('#process-slot');
  const workstreams = await api.workstreams(space.id);
  let closePanel = null;
  cleanups.push(() => closePanel?.());

  function openPanel(record) {
    closePanel?.();
    closePanel = mountProcessPanel(slot, record, {
      onHidden: () => { closePanel = null; },
      onSaved: () => {},
      onBranchCreated: () => reload(),
      onApplied: (revised) => { textEl.value = revised; savedValue = revised; },
    });
    slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  workstreams.forEach((ws, i) => {
    const btn = document.createElement('button');
    btn.className = 'ghost-btn';
    btn.textContent = ws.name;
    btn.title = ws.available
      ? ws.description
      : `${ws.description}\n\nNeeds in the Tool Shed: ${ws.missingTools.join(', ')}`;
    btn.disabled = !ws.available;
    positionRadially(btn, i, workstreams.length);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const record = await api.startProcess(space.id, ws.id);
        openPanel(record);
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.disabled = !ws.available;
      }
    });
    radial.appendChild(btn);
  });

  // Re-attach the most recent foreground running process (e.g. after nav).
  const processes = await api.processes(space.id);
  const foreground = processes.find((p) => p.visibility === 'foreground' && p.status === 'running');
  if (foreground) openPanel(foreground);
}

function positionRadially(el, index, total) {
  // Distribute around an ellipse, starting at the top.
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const rx = 42; // percent of container width
  const ry = 44; // percent of container height
  el.style.left = `${50 + rx * Math.cos(angle)}%`;
  el.style.top = `${50 + ry * Math.sin(angle)}%`;
}

// ================================================================ Branches

async function renderBranches(body, space) {
  const { currentBranch, branches } = await api.branches(space.id);

  body.innerHTML = `
    <div class="spread">
      <p class="muted">Branches are alternate directions of this idea, each with its own Current Understanding.</p>
      <div class="row">
        <input id="new-branch-name" type="text" placeholder="new-branch-name" style="width:200px" />
        <button id="new-branch" class="btn-small">⎇ Create branch</button>
        <button id="compare" class="btn-small">Compare all</button>
      </div>
    </div>
    <div class="item-list">
      ${branches.map((b) => branchRow(b, currentBranch)).join('')}
    </div>
    <div id="compare-slot"></div>`;

  body.querySelector('#new-branch').addEventListener('click', async () => {
    const name = body.querySelector('#new-branch-name').value.trim();
    if (!name) return toast('Give the branch a name (lowercase-with-dashes).', true);
    try {
      await api.createBranch(space.id, { name });
      toast(`Created and switched to "${name}"`);
      reload();
    } catch (err) {
      toast(err.message, true);
    }
  });

  body.querySelectorAll('[data-switch]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await api.switchBranch(space.id, btn.dataset.switch);
        toast(`Switched to "${btn.dataset.switch}"`);
        reload();
      } catch (err) {
        toast(err.message, true);
      }
    })
  );

  body.querySelectorAll('[data-rename]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const newName = prompt(`Rename branch "${btn.dataset.rename}" to:`, btn.dataset.rename);
      if (!newName || newName === btn.dataset.rename) return;
      try {
        await api.renameBranch(space.id, btn.dataset.rename, newName.trim());
        reload();
      } catch (err) {
        toast(err.message, true);
      }
    })
  );

  body.querySelector('#compare').addEventListener('click', async () => {
    const slot = body.querySelector('#compare-slot');
    slot.innerHTML = '<p class="muted">Loading comparison…</p>';
    const compared = await api.compareBranches(space.id);
    slot.innerHTML = `
      <h2 style="margin-top:28px">Branch comparison</h2>
      <div class="compare-grid">
        ${compared
          .map(
            (b) => `
          <div class="card">
            <div class="spread"><span class="item-title">⎇ ${escapeHtml(b.name)}</span>
            ${b.name === currentBranch ? '<span class="badge completed">current</span>' : ''}</div>
            <div class="md" style="font-size:13.5px">${renderMarkdown(b.understanding || '_empty_')}</div>
          </div>`
          )
          .join('')}
      </div>`;
  });
}

function branchRow(branch, currentBranch) {
  const isCurrent = branch.name === currentBranch;
  return `
    <div class="card">
      <div class="spread">
        <div>
          <span class="item-title">⎇ ${escapeHtml(branch.name)}</span>
          ${isCurrent ? '<span class="badge completed" style="margin-left:8px">current</span>' : ''}
          <div class="faint">${escapeHtml(branch.note || '')} · updated ${timeAgo(branch.updatedAt)}</div>
        </div>
        <div class="row">
          ${isCurrent ? '' : `<button class="btn-small" data-switch="${branch.name}">Switch</button>`}
          <button class="btn-small" data-rename="${branch.name}">Rename</button>
        </div>
      </div>
    </div>`;
}

// ================================================================ Processes

async function renderProcesses(body, space, cleanups) {
  body.innerHTML = `
    <p class="muted">Every run of a workstream is a process. Hidden (background) processes keep
    running — show one to watch it live.</p>
    <div id="panel-slot"></div>
    <div class="item-list" id="proc-list"></div>`;

  const slot = body.querySelector('#panel-slot');
  const list = body.querySelector('#proc-list');
  let closePanel = null;
  cleanups.push(() => closePanel?.());

  async function refresh() {
    const processes = await api.processes(space.id);
    if (!processes.length) {
      list.innerHTML = '<div class="card muted">No processes yet — run a workstream from the Core tab.</div>';
      return;
    }
    list.innerHTML = processes.map(processRow).join('');
    bindRowActions();
  }

  function bindRowActions() {
    list.querySelectorAll('[data-show]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const record = await api.setProcessVisibility(btn.dataset.show, 'foreground').catch(() => api.process(btn.dataset.show));
        closePanel?.();
        closePanel = mountProcessPanel(slot, record, {
          onHidden: () => { closePanel = null; refresh(); },
          onSaved: () => refresh(),
          onBranchCreated: () => reload(),
        });
        slot.scrollIntoView({ behavior: 'smooth' });
        refresh();
      })
    );
    list.querySelectorAll('[data-stop]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        await api.stopProcess(btn.dataset.stop).catch((err) => toast(err.message, true));
        refresh();
      })
    );
    list.querySelectorAll('[data-save]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const title = prompt('Name this output:');
        if (title === null) return;
        try {
          await api.saveProcessOutput(btn.dataset.save, title || undefined);
          toast('Saved as output.');
          refresh();
        } catch (err) {
          toast(err.message, true);
        }
      })
    );
  }

  await refresh();
  const timer = setInterval(refresh, 3000);
  cleanups.push(() => clearInterval(timer));
}

function processRow(p) {
  const canSave = p.status !== 'running' && p.output && !p.savedOutputId;
  return `
    <div class="card">
      <div class="spread">
        <div>
          <span class="item-title">${escapeHtml(p.workstreamName)}</span>
          <span class="badge ${p.status}" style="margin-left:8px">${p.status}</span>
          ${p.visibility === 'background' && p.status === 'running' ? '<span class="badge">hidden</span>' : ''}
          ${p.savedOutputId ? '<span class="badge completed">saved ✓</span>' : ''}
          <div class="faint">⎇ ${escapeHtml(p.branch)} · via ${escapeHtml(p.provider)} · started ${timeAgo(p.startedAt)}${p.error ? ` · ⚠ ${escapeHtml(p.error)}` : ''}</div>
        </div>
        <div class="row">
          <button class="btn-small" data-show="${p.id}">${p.status === 'running' ? 'Show' : 'View'}</button>
          ${p.status === 'running' ? `<button class="btn-small btn-danger" data-stop="${p.id}">Stop</button>` : ''}
          ${canSave ? `<button class="btn-small" data-save="${p.id}">💾 Save as Output</button>` : ''}
        </div>
      </div>
    </div>`;
}

// ================================================================ Outputs

async function renderOutputs(body, space, cleanups) {
  body.innerHTML = `
    <div class="spread">
      <p class="muted">Saved workstream results and hand-entered notes. Everything here is an
      editable markdown file in this Idea Space's <code>outputs/</code> folder.</p>
      <button class="btn-small" id="add-note">＋ Add note</button>
    </div>
    <div id="editor-slot"></div>
    <div class="item-list" id="output-list"></div>`;

  const list = body.querySelector('#output-list');
  const editorSlot = body.querySelector('#editor-slot');

  async function refresh() {
    const outputs = await api.outputs(space.id);
    if (!outputs.length) {
      list.innerHTML = '<div class="card muted">No outputs yet — run a workstream and save its result, or add a note.</div>';
      return;
    }
    list.innerHTML = outputs
      .map(
        (o) => `
      <div class="card">
        <div class="spread">
          <div>
            <span class="item-title">${escapeHtml(o.title)}</span>
            <span class="badge" style="margin-left:8px">${escapeHtml(o.type)}</span>
            <div class="faint">⎇ ${escapeHtml(o.branch || '?')} ${o.workstream ? `· from ${escapeHtml(o.workstream)}` : '· hand-entered'} · ${timeAgo(o.createdAt)}</div>
          </div>
          <div class="row">
            <button class="btn-small" data-open="${o.id}">Open</button>
            <button class="btn-small btn-danger" data-delete="${o.id}">Delete</button>
          </div>
        </div>
      </div>`
      )
      .join('');

    list.querySelectorAll('[data-open]').forEach((btn) =>
      btn.addEventListener('click', () => openEditor(btn.dataset.open))
    );
    list.querySelectorAll('[data-delete]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this output? The file will be removed.')) return;
        await api.deleteOutput(space.id, btn.dataset.delete).catch((err) => toast(err.message, true));
        refresh();
      })
    );
  }

  async function openEditor(outputId) {
    const output = await api.output(space.id, outputId);
    mountEditor({
      title: output.title,
      content: output.content,
      onSave: async (title, content) => {
        await api.updateOutput(space.id, outputId, { title, content });
        toast('Output saved.');
        refresh();
      },
    });
  }

  body.querySelector('#add-note').addEventListener('click', () => {
    mountEditor({
      title: '',
      content: '',
      onSave: async (title, content) => {
        await api.saveOutput(space.id, { title: title || 'Note', type: 'note', content });
        toast('Note saved.');
        refresh();
      },
    });
  });

  function mountEditor({ title, content, onSave }) {
    editorSlot.innerHTML = `
      <div class="card" style="margin:16px 0">
        <input type="text" id="ed-title" placeholder="Title" value="${escapeHtml(title)}" />
        <textarea id="ed-content" style="min-height:260px;margin-top:10px;font-family:var(--mono);font-size:13.5px">${escapeHtml(content)}</textarea>
        <div class="row" style="margin-top:10px;justify-content:flex-end">
          <button class="btn-small" id="ed-cancel">Close</button>
          <button class="btn-small btn-primary" id="ed-save">Save</button>
        </div>
      </div>`;
    editorSlot.querySelector('#ed-cancel').addEventListener('click', () => (editorSlot.innerHTML = ''));
    editorSlot.querySelector('#ed-save').addEventListener('click', async () => {
      try {
        await onSave(
          editorSlot.querySelector('#ed-title').value.trim(),
          editorSlot.querySelector('#ed-content').value
        );
        editorSlot.innerHTML = '';
      } catch (err) {
        toast(err.message, true);
      }
    });
    editorSlot.scrollIntoView({ behavior: 'smooth' });
  }

  await refresh();
}
