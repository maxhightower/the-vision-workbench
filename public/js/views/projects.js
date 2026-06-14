import { api } from '../api.js';
import { escapeHtml } from '../md.js';
import { toast, timeAgo, reload } from '../app.js';

/**
 * Projects home: every working directory you've registered for gstack. A
 * project is just a pointer to a real folder on disk where skills run.
 */
export async function renderProjects(app) {
  app.innerHTML = '<p class="muted">Loading projects…</p>';
  const projects = await api.projects();

  app.innerHTML = `
    <div class="spread">
      <div>
        <h1>Projects</h1>
        <p class="subtitle">${projects.length} ${projects.length === 1 ? 'project' : 'projects'} · gstack runs in each project's folder</p>
      </div>
      <button class="btn btn-primary" id="add-toggle">＋ Add project</button>
    </div>

    <div id="add-form" class="card hidden" style="margin-bottom:18px">
      <div class="row" style="align-items:flex-end">
        <div style="flex:2;min-width:260px">
          <label>Project folder (absolute path)</label>
          <input type="text" id="p-path" placeholder="/Users/you/code/my-app" spellcheck="false" />
        </div>
        <div style="flex:1;min-width:160px">
          <label>Name <span class="faint">(optional)</span></label>
          <input type="text" id="p-name" placeholder="defaults to folder name" />
        </div>
        <button class="btn btn-primary" id="p-add">Add</button>
      </div>
      <p class="faint" style="margin-top:10px">The folder must already exist. gstack skills run there via the Claude Code CLI — nothing is written outside that folder by gstack UI itself.</p>
    </div>

    <div id="project-list"></div>`;

  const form = app.querySelector('#add-form');
  app.querySelector('#add-toggle').addEventListener('click', () => {
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) app.querySelector('#p-path').focus();
  });

  app.querySelector('#p-add').addEventListener('click', async () => {
    const path = app.querySelector('#p-path').value.trim();
    const name = app.querySelector('#p-name').value.trim();
    if (!path) return toast('Enter the project folder path.', true);
    try {
      const project = await api.addProject(name, path);
      toast(`Added "${project.name}"`);
      location.hash = `#/project/${project.id}`;
    } catch (err) {
      toast(err.message, true);
    }
  });

  const list = app.querySelector('#project-list');
  if (!projects.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="big">⚡</div>
        <h2>No projects yet</h2>
        <p class="muted">Add a code folder, then run Garry Tan's gstack skills against it — straight from the browser.</p>
      </div>`;
    return;
  }

  list.innerHTML = `<div class="grid">${projects.map(card).join('')}</div>`;
  list.querySelectorAll('.proj-card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove]')) return;
      location.hash = `#/project/${el.dataset.id}`;
    });
  });
  list.querySelectorAll('[data-remove]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Remove this project from gstack UI?\n(Your code folder is not touched.)')) return;
      try {
        await api.removeProject(btn.dataset.remove);
        reload();
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
}

function card(p) {
  return `
    <div class="card proj-card" data-id="${p.id}">
      <div class="spread">
        <h3>${escapeHtml(p.name)}</h3>
        <button class="btn-small btn-danger" data-remove="${p.id}" title="Remove project">✕</button>
      </div>
      <p class="path mono">${escapeHtml(p.path)}</p>
      <div class="meta">
        <span class="badge">used ${timeAgo(p.lastUsedAt)}</span>
      </div>
    </div>`;
}
