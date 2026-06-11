import { renderOrchard } from './views/orchard.js';
import { renderSeed } from './views/seed.js';
import { renderSpace } from './views/space.js';
import { renderToolShed } from './views/toolshed.js';

const app = document.getElementById('app');

const routes = [
  { regex: /^#?\/?$/, nav: 'orchard', view: () => renderOrchard(app) },
  { regex: /^#\/seed$/, nav: 'seed', view: () => renderSeed(app) },
  { regex: /^#\/toolshed$/, nav: 'toolshed', view: () => renderToolShed(app) },
  {
    regex: /^#\/space\/([a-z0-9-]+)(?:\/([a-z]+))?$/,
    nav: null,
    view: (match) => renderSpace(app, match[1], match[2] || 'core'),
  },
];

let cleanup = null;

async function route() {
  const hash = location.hash || '#/';
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;

  for (const r of routes) {
    const match = r.regex.exec(hash);
    if (!match) continue;
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === r.nav);
    });
    try {
      cleanup = await r.view(match);
    } catch (err) {
      app.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${err.message}</p></div>`;
    }
    return;
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', route);
route();

// ------------------------------------------------------------ shared helpers

let toastTimer = null;
export function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
