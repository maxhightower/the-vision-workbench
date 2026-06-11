import { api, streamProcess } from '../api.js';
import { renderMarkdown, escapeHtml } from '../md.js';
import { toast } from '../app.js';

/**
 * The process panel: a live view of one running (or finished) Process.
 * Used as the "foreground" view on the Core tab and from the Processes tab.
 *
 * mount(container, record, hooks) -> close()
 * hooks: { onHidden(), onSaved(output), onBranchCreated(name), onApplied() }
 */
export function mountProcessPanel(container, record, hooks = {}) {
  let output = '';
  let status = record.status;
  let closed = false;

  container.innerHTML = `
    <div class="process-panel">
      <div class="panel-head">
        <div class="row">
          <strong>${escapeHtml(record.workstreamName)}</strong>
          <span class="badge ${status}" data-role="status">${status}</span>
          <span class="faint">via ${escapeHtml(record.provider)} · branch ${escapeHtml(record.branch)}</span>
          ${record.input?.guidance ? `<span class="faint" title="${escapeHtml(record.input.guidance)}">· “${escapeHtml(record.input.guidance.slice(0, 70))}${record.input.guidance.length > 70 ? '…' : ''}”</span>` : ''}
        </div>
        <div class="row">
          <button class="btn-small" data-act="apply" style="display:none">Apply to Current Understanding</button>
          <button class="btn-small" data-act="save" style="display:none">💾 Save as Output</button>
          <button class="btn-small btn-danger" data-act="stop" style="display:none">■ Stop</button>
          <button class="btn-small" data-act="hide">Hide ↓</button>
        </div>
      </div>
      <div class="panel-body md cursor-blink" data-role="body"><p class="muted">Waiting for output…</p></div>
      <div class="branch-suggestions" data-role="branches"></div>
    </div>`;

  const panel = container.querySelector('.process-panel');
  const body = panel.querySelector('[data-role=body]');
  const statusBadge = panel.querySelector('[data-role=status]');
  const btn = (act) => panel.querySelector(`[data-act=${act}]`);

  let renderQueued = false;
  function paint() {
    if (renderQueued || closed) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      body.innerHTML = renderMarkdown(output) || '<p class="muted">Waiting for output…</p>';
      body.scrollTop = body.scrollHeight;
    });
  }

  function setStatus(next, error) {
    status = next;
    statusBadge.textContent = next;
    statusBadge.className = `badge ${next}`;
    const running = next === 'running';
    btn('stop').style.display = running ? '' : 'none';
    body.classList.toggle('cursor-blink', running);
    if (!running && output.trim() && !record.savedOutputId) {
      btn('save').style.display = '';
    }
    if (next === 'completed') {
      // Any workstream that emits a "Current Understanding (revised)" section
      // (Cultivate Seed, Refine Understanding, …) can be applied to the core.
      if (extractRevisedUnderstanding(output)) {
        btn('apply').style.display = '';
      }
      if (record.workstreamId === 'generate-branches') {
        renderBranchSuggestions();
      }
    }
    if (error) {
      body.insertAdjacentHTML(
        'beforeend',
        `<blockquote>⚠ ${escapeHtml(error)}</blockquote>`
      );
    }
  }

  const stopStream = streamProcess(record.id, {
    onSnapshot(snap) {
      output = snap.output || '';
      record.savedOutputId = snap.savedOutputId;
      paint();
      setStatus(snap.status, snap.status === 'failed' ? snap.error : null);
    },
    onChunk(text) {
      output += text;
      paint();
    },
    onEnd(endStatus, error) {
      setStatus(endStatus, endStatus === 'failed' ? error : null);
    },
  });

  btn('stop').addEventListener('click', async () => {
    try {
      await api.stopProcess(record.id);
    } catch (err) {
      toast(err.message, true);
    }
  });

  btn('hide').addEventListener('click', async () => {
    try {
      await api.setProcessVisibility(record.id, 'background');
    } catch {
      // process may have been cleaned up; hiding the panel is still fine
    }
    close();
    hooks.onHidden?.();
    toast('Process moved to background — find it in the Processes tab.');
  });

  btn('save').addEventListener('click', async () => {
    const title = prompt('Name this output:', `${record.outputTitle} (${record.branch})`);
    if (title === null) return;
    try {
      const { output: saved } = await api.saveProcessOutput(record.id, title);
      record.savedOutputId = saved.id;
      btn('save').style.display = 'none';
      toast(`Saved output "${saved.title}"`);
      hooks.onSaved?.(saved);
    } catch (err) {
      toast(err.message, true);
    }
  });

  btn('apply').addEventListener('click', async () => {
    const revised = extractRevisedUnderstanding(output);
    if (!revised) return;
    if (!confirm('Replace the Current Understanding on this branch with the revised version?\n(The previous version is saved to Outputs automatically.)')) return;
    try {
      // Snapshot the outgoing understanding so refining never loses a version.
      const space = await api.space(record.spaceId);
      if (space.understanding.trim() && space.understanding.trim() !== revised.trim()) {
        await api.saveOutput(record.spaceId, {
          title: `Understanding before ${record.workstreamName} (${record.branch})`,
          type: 'current_understanding',
          content: space.understanding,
        });
      }
      await api.saveUnderstanding(record.spaceId, revised);
      toast('Current Understanding updated — previous version saved to Outputs.');
      hooks.onApplied?.(revised);
    } catch (err) {
      toast(err.message, true);
    }
  });

  function renderBranchSuggestions() {
    const suggestions = parseBranchDirections(output);
    if (!suggestions.length) return;
    const holder = panel.querySelector('[data-role=branches]');
    holder.innerHTML = suggestions
      .map(
        (s, i) =>
          `<button class="btn-small" data-branch="${i}">⎇ Create branch "${escapeHtml(s.name)}"</button>`
      )
      .join('');
    holder.querySelectorAll('[data-branch]').forEach((b) => {
      b.addEventListener('click', async () => {
        const s = suggestions[Number(b.dataset.branch)];
        try {
          await api.createBranch(record.spaceId, {
            name: s.name,
            note: `From Generate Branches: ${s.description.slice(0, 120)}`,
            startingUnderstanding: s.understanding,
          });
          toast(`Created and switched to branch "${s.name}"`);
          hooks.onBranchCreated?.(s.name);
        } catch (err) {
          toast(err.message, true);
        }
      });
    });
  }

  function close() {
    closed = true;
    stopStream();
    container.innerHTML = '';
  }

  return close;
}

function extractRevisedUnderstanding(text) {
  const match = /##\s*Current Understanding \(revised\)\s*\n([\s\S]*?)(?=\n##\s|$)/.exec(text);
  return match ? match[1].trim() : null;
}

function parseBranchDirections(text) {
  const out = [];
  const regex = /###\s*Branch:\s*([^\n]+)\n([\s\S]*?)(?=\n###\s|$)/g;
  let match;
  while ((match = regex.exec(text)) && out.length < 6) {
    const name = match[1]
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const description = match[2].trim();
    if (!name) continue;
    out.push({
      name,
      description,
      understanding: `## Direction: ${match[1].trim()}\n\n${description}`,
    });
  }
  return out;
}
