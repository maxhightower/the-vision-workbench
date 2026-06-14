import { api } from '../api.js';
import { escapeHtml } from '../md.js';
import { toast, timeAgo } from '../app.js';
import { mountRunPanel } from './runPanel.js';

/**
 * The Project view: the gstack sprint pipeline (phases of skills) you can run
 * against this project's folder, a live run panel, and the run history.
 */
export async function renderProject(app, projectId) {
  const [project, catalog] = await Promise.all([api.project(projectId), api.catalog()]);
  const cleanups = [];

  app.innerHTML = `
    <div class="proj-header">
      <a href="#/" class="faint">← Projects</a>
      <h1>${escapeHtml(project.name)}</h1>
      <p class="path mono">${escapeHtml(project.path)}</p>
    </div>

    <div id="run-slot"></div>

    <p class="subtitle" style="margin-top:8px">Run any gstack skill here. Each runs Claude Code in the folder above — follow the
      <strong>Think → Plan → Design → Review → Test → Ship</strong> pipeline, or jump anywhere.</p>

    <div class="pipeline">
      ${catalog.map(phaseBlock).join('')}
    </div>

    <h2 style="margin-top:34px">Run history</h2>
    <div class="item-list" id="run-list"></div>`;

  const slot = app.querySelector('#run-slot');
  const runList = app.querySelector('#run-list');
  let closePanel = null;
  cleanups.push(() => closePanel?.());

  function openPanel(record) {
    closePanel?.();
    closePanel = mountRunPanel(slot, record, {
      onEnd: () => refreshRuns(),
      onClose: () => {
        closePanel = null;
      },
    });
    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- launching a skill (with an optional args line)
  app.querySelectorAll('[data-skill]').forEach((btn) =>
    btn.addEventListener('click', () => openLauncher(btn.dataset.skill, btn.dataset.hint, btn.dataset.name, btn.dataset.interactive === '1'))
  );

  function openLauncher(skillId, hint, name, interactive) {
    closePanel?.();
    closePanel = null;
    slot.innerHTML = `
      <div class="run-panel">
        <div class="panel-head">
          <div class="row"><strong>${escapeHtml(name)}</strong>
          <span class="faint mono">/${escapeHtml(skillId)}</span></div>
        </div>
        <div style="padding:14px 16px">
          ${interactive ? `<p class="faint" style="margin-top:0">⚠ This skill is normally interactive. In headless mode it runs one-shot — add any answers it would ask for as arguments below.</p>` : ''}
          <label>Arguments <span class="faint">(optional — appended to the command)</span></label>
          <input type="text" id="run-args" placeholder="${escapeHtml(hint || 'extra context for the skill')}" spellcheck="false" />
          <div class="row" style="margin-top:12px;justify-content:flex-end">
            <button class="btn-small" data-act="cancel">Cancel</button>
            <button class="btn-small btn-primary" data-act="go">▶ Run /${escapeHtml(skillId)}</button>
          </div>
        </div>
      </div>`;
    const input = slot.querySelector('#run-args');
    input.focus();
    const launch = async () => {
      try {
        const record = await api.startRun(project.id, skillId, input.value.trim());
        openPanel(record);
        refreshRuns();
      } catch (err) {
        toast(err.message, true);
      }
    };
    slot.querySelector('[data-act=cancel]').addEventListener('click', () => (slot.innerHTML = ''));
    slot.querySelector('[data-act=go]').addEventListener('click', launch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') launch();
    });
    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- run history
  async function refreshRuns() {
    const runs = await api.runs(project.id);
    if (!runs.length) {
      runList.innerHTML = '<div class="card muted">No runs yet — launch a skill above.</div>';
      return;
    }
    runList.innerHTML = runs.map(runRow).join('');
    runList.querySelectorAll('[data-open]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          const record = await api.run(btn.dataset.open);
          openPanel(record);
        } catch (err) {
          toast(err.message, true);
        }
      })
    );
    runList.querySelectorAll('[data-stop]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        await api.stopRun(btn.dataset.stop).catch((err) => toast(err.message, true));
        refreshRuns();
      })
    );
  }

  await refreshRuns();
  const timer = setInterval(refreshRuns, 4000);
  cleanups.push(() => clearInterval(timer));

  // Re-attach a currently-running run if we navigated back to this project.
  const runs = await api.runs(project.id);
  const running = runs.find((r) => r.status === 'running');
  if (running) openPanel(running);

  return () => cleanups.forEach((fn) => fn());
}

function phaseBlock(phase) {
  return `
    <section class="phase">
      <div class="phase-head">
        <h3>${escapeHtml(phase.label)}</h3>
        <span class="faint">${escapeHtml(phase.blurb)}</span>
      </div>
      <div class="skill-row">
        ${phase.skills.map(skillBtn).join('')}
      </div>
    </section>`;
}

function skillBtn(s) {
  return `
    <button class="skill-btn" data-skill="${s.id}" data-name="${escapeHtml(s.name)}"
      data-hint="${escapeHtml(s.hint || '')}" data-interactive="${s.interactive ? 1 : 0}"
      title="${escapeHtml(s.desc)}">
      <span class="skill-name">${escapeHtml(s.name)}${s.interactive ? ' <span class="faint">◐</span>' : ''}</span>
      <span class="skill-cmd mono">/${escapeHtml(s.id)}</span>
    </button>`;
}

function runRow(r) {
  return `
    <div class="card">
      <div class="spread">
        <div>
          <span class="item-title">${escapeHtml(r.skillName)}</span>
          <span class="badge ${r.status}" style="margin-left:8px">${r.status}</span>
          <div class="faint mono">${escapeHtml(r.promptText)}</div>
          <div class="faint">started ${timeAgo(r.startedAt)}${r.error ? ` · ⚠ ${escapeHtml(r.error.slice(0, 80))}` : ''}</div>
        </div>
        <div class="row">
          <button class="btn-small" data-open="${r.id}">${r.status === 'running' ? 'Show' : 'View'}</button>
          ${r.status === 'running' ? `<button class="btn-small btn-danger" data-stop="${r.id}">Stop</button>` : ''}
        </div>
      </div>
    </div>`;
}
