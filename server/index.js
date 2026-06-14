import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, GSTACK_UI_HOME, ensureHome } from './config.js';
import { HttpError, readJsonBody, sendJson } from './util.js';
import * as store from './store.js';
import * as runner from './runner.js';
import { getCatalog } from './catalog.js';
import { readSettings, writeSettings, PERMISSION_MODES } from './settings.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// route table: [method, regex, handler(req, res, params)]
const routes = [
  // ---- catalog (bundled gstack skills)
  ['GET', /^\/api\/catalog$/, () => getCatalog()],

  // ---- projects
  ['GET', /^\/api\/projects$/, () => store.listProjects()],
  ['POST', /^\/api\/projects$/, async (req) => store.addProject(await readJsonBody(req))],
  [
    'GET',
    /^\/api\/projects\/([a-z0-9-]+)$/,
    (req, res, [id]) => {
      const project = store.touchProject(id);
      const runs = runner.listProjectRuns(id);
      return {
        ...project,
        runningCount: runs.filter((r) => r.status === 'running').length,
        runsCount: runs.length,
      };
    },
  ],
  [
    'DELETE',
    /^\/api\/projects\/([a-z0-9-]+)$/,
    (req, res, [id]) => {
      store.removeProject(id);
      return { ok: true };
    },
  ],

  // ---- runs
  ['GET', /^\/api\/projects\/([a-z0-9-]+)\/runs$/, (req, res, [id]) => runner.listProjectRuns(id)],
  [
    'POST',
    /^\/api\/projects\/([a-z0-9-]+)\/runs$/,
    async (req, res, [id]) => {
      const { skillId, args } = await readJsonBody(req);
      if (!skillId) throw new HttpError(400, 'skillId is required');
      return runner.startRun(id, skillId, args);
    },
  ],
  ['GET', /^\/api\/runs\/([a-z0-9-]+)$/, (req, res, [rid]) => runner.getRun(rid)],
  [
    'GET',
    /^\/api\/runs\/([a-z0-9-]+)\/stream$/,
    (req, res, [rid]) => {
      runner.subscribe(rid, res);
      return undefined; // response handled by SSE
    },
  ],
  ['POST', /^\/api\/runs\/([a-z0-9-]+)\/stop$/, (req, res, [rid]) => runner.stopRun(rid)],

  // ---- settings
  ['GET', /^\/api\/settings$/, () => ({ ...readSettings(), permissionModes: PERMISSION_MODES })],
  ['PUT', /^\/api\/settings$/, async (req) => writeSettings(await readJsonBody(req))],

  ['GET', /^\/api\/health$/, () => ({ ok: true, home: GSTACK_UI_HOME })],
];

async function handleApi(req, res, pathname) {
  for (const [method, regex, handler] of routes) {
    if (req.method !== method) continue;
    const match = regex.exec(pathname);
    if (!match) continue;
    const result = await handler(req, res, match.slice(1));
    if (result !== undefined) sendJson(res, req.method === 'POST' ? 201 : 200, result);
    return true;
  }
  return false;
}

function serveStatic(res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  let file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  if (!fs.existsSync(file)) {
    // SPA fallback: unknown non-API paths get the app shell.
    file = path.join(PUBLIC_DIR, 'index.html');
  }
  const type = MIME[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname);
      if (!handled) sendJson(res, 404, { error: `No route: ${req.method} ${pathname}` });
      return;
    }
    serveStatic(res, pathname);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: err.message });
    else res.end();
  }
});

ensureHome();
runner.reconcileOnBoot();
server.listen(PORT, () => {
  console.log(`\n  gstack UI is running:  http://localhost:${PORT}`);
  console.log(`  State lives in:        ${GSTACK_UI_HOME}\n`);
});
