import { api, streamRun } from '../api.js';
import { renderMarkdown, escapeHtml } from '../md.js';
import { toast } from '../app.js';

/**
 * Live view of one gstack Run: streams the Claude Code CLI output, shows the
 * exact command, and lets you stop it.
 *
 * mount(container, record, hooks) -> close()
 * hooks: { onEnd(status), onClose() }
 */
export function mountRunPanel(container, record, hooks = {}) {
  let output = record.output || '';
  let status = record.status;
  let closed = false;

  container.innerHTML = `
    <div class="run-panel">
      <div class="panel-head">
        <div class="row">
          <strong>${escapeHtml(record.skillName)}</strong>
          <span class="badge ${status}" data-role="status">${status}</span>
          <span class="faint">in ${escapeHtml(shortPath(record.cwd))}</span>
        </div>
        <div class="row">
          <button class="btn-small btn-danger" data-act="stop" style="display:none">■ Stop</button>
          <button class="btn-small" data-act="close">Close ✕</button>
        </div>
      </div>
      <div class="run-cmd mono" title="The command gstack UI ran">$ ${escapeHtml(record.command)}</div>
      <div class="panel-body md" data-role="body"><p class="muted">Launching Claude Code…</p></div>
    </div>`;

  const panel = container.querySelector('.run-panel');
  const body = panel.querySelector('[data-role=body]');
  const statusBadge = panel.querySelector('[data-role=status]');
  const btn = (act) => panel.querySelector(`[data-act=${act}]`);

  let renderQueued = false;
  function paint() {
    if (renderQueued || closed) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
      body.innerHTML = renderMarkdown(output) || '<p class="muted">Waiting for output…</p>';
      if (nearBottom) body.scrollTop = body.scrollHeight;
    });
  }

  function setStatus(next, error) {
    status = next;
    statusBadge.textContent = next;
    statusBadge.className = `badge ${next}`;
    const running = next === 'running';
    btn('stop').style.display = running ? '' : 'none';
    body.classList.toggle('cursor-blink', running);
    if (error) {
      body.insertAdjacentHTML('beforeend', `<blockquote>⚠ ${escapeHtml(error)}</blockquote>`);
      body.scrollTop = body.scrollHeight;
    }
  }

  paint();
  setStatus(status, status === 'failed' ? record.error : null);

  const stopStream = streamRun(record.id, {
    onSnapshot(snap) {
      output = snap.output || '';
      paint();
      setStatus(snap.status, snap.status === 'failed' ? snap.error : null);
    },
    onChunk(text) {
      output += text;
      paint();
    },
    onEnd(endStatus, error) {
      setStatus(endStatus, endStatus === 'failed' ? error : null);
      hooks.onEnd?.(endStatus);
    },
  });

  btn('stop').addEventListener('click', async () => {
    try {
      await api.stopRun(record.id);
    } catch (err) {
      toast(err.message, true);
    }
  });

  btn('close').addEventListener('click', () => {
    close();
    hooks.onClose?.();
  });

  function close() {
    closed = true;
    stopStream();
    container.innerHTML = '';
  }

  return close;
}

function shortPath(p) {
  const home = '';
  void home;
  const parts = String(p).split('/').filter(Boolean);
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
}
