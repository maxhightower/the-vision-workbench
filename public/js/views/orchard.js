import { api } from '../api.js';
import { escapeHtml } from '../md.js';
import { timeAgo } from '../app.js';

export async function renderOrchard(app) {
  app.innerHTML = '<p class="muted">Loading the orchard…</p>';
  const spaces = await api.orchard();

  if (!spaces.length) {
    app.innerHTML = `
      <div class="empty-orchard">
        <div class="big">🌱</div>
        <h1>The orchard is empty</h1>
        <p>Every idea starts as a seed — small, unpolished, full of potential.</p>
        <p style="margin-top:20px"><a class="btn btn-primary" href="#/seed">Plant your first Seed</a></p>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="spread">
      <div>
        <h1>Orchard</h1>
        <p class="subtitle">${spaces.length} idea ${spaces.length === 1 ? 'space' : 'spaces'} growing</p>
      </div>
      <a class="btn btn-primary" href="#/seed">＋ Plant a Seed</a>
    </div>
    <div class="orchard-grid">
      ${spaces.map(spaceCard).join('')}
    </div>`;

  app.querySelectorAll('.space-card').forEach((card) => {
    card.addEventListener('click', () => {
      location.hash = `#/space/${card.dataset.id}`;
    });
  });
}

function spaceCard(space) {
  const running = space.runningProcesses
    ? `<span class="badge running">${space.runningProcesses} running</span>`
    : '';
  return `
    <div class="card space-card" data-id="${space.id}">
      <h3>${escapeHtml(space.title)}</h3>
      ${space.tags?.length ? `<div class="tag-row" style="margin-bottom:8px">${space.tags.map((t) => `<span class="tag-chip on">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <p class="preview">${escapeHtml(space.understandingPreview || 'No understanding yet.')}</p>
      <div class="meta">
        <span class="badge">⎇ ${space.branchesCount} ${space.branchesCount === 1 ? 'branch' : 'branches'}</span>
        <span class="badge">▣ ${space.outputsCount} ${space.outputsCount === 1 ? 'output' : 'outputs'}</span>
        ${running}
        <span class="badge">opened ${timeAgo(space.lastOpenedAt)}</span>
      </div>
    </div>`;
}
