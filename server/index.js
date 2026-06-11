import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, WORKBENCH_HOME, ensureHome } from './config.js';
import { HttpError, readJsonBody, sendJson } from './util.js';
import * as store from './store.js';
import * as proc from './processes.js';
import { listWorkstreams, getWorkstream } from './workstreams.js';
import { readToolShed, writeToolShed, maskToolShed } from './toolshed.js';

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
  // ---- orchard
  ['GET', /^\/api\/orchard$/, () => store.listSpaces()],
  ['POST', /^\/api\/orchard$/, async (req) => store.plantSeed(await readJsonBody(req))],

  // ---- idea space
  [
    'GET',
    /^\/api\/spaces\/([a-z0-9-]+)$/,
    (req, res, [id]) => {
      const settings = store.touchSpace(id);
      return {
        ...settings,
        seed: store.readSeed(id),
        understanding: store.readUnderstanding(id),
        branches: store.listBranches(id),
        outputsCount: store.listOutputs(id).length,
        runningProcesses: proc.listSpaceProcesses(id).filter((p) => p.status === 'running').length,
      };
    },
  ],
  [
    'PUT',
    /^\/api\/spaces\/([a-z0-9-]+)\/understanding$/,
    async (req, res, [id]) => {
      const { content } = await readJsonBody(req);
      if (typeof content !== 'string') throw new HttpError(400, 'content (string) is required');
      store.writeUnderstanding(id, content);
      return { ok: true };
    },
  ],

  [
    'PUT',
    /^\/api\/spaces\/([a-z0-9-]+)\/tags$/,
    async (req, res, [id]) => {
      const { tags } = await readJsonBody(req);
      return { tags: store.setTags(id, tags).tags };
    },
  ],

  // ---- branches
  ['GET', /^\/api\/spaces\/([a-z0-9-]+)\/branches$/, (req, res, [id]) => ({
    currentBranch: store.readSettings(id).currentBranch,
    branches: store.listBranches(id),
  })],
  [
    'POST',
    /^\/api\/spaces\/([a-z0-9-]+)\/branches$/,
    async (req, res, [id]) => store.createBranch(id, await readJsonBody(req)),
  ],
  [
    'POST',
    /^\/api\/spaces\/([a-z0-9-]+)\/branches\/switch$/,
    async (req, res, [id]) => {
      const { name } = await readJsonBody(req);
      return store.switchBranch(id, name);
    },
  ],
  [
    'POST',
    /^\/api\/spaces\/([a-z0-9-]+)\/branches\/rename$/,
    async (req, res, [id]) => {
      const { oldName, newName } = await readJsonBody(req);
      store.renameBranch(id, oldName, newName);
      return { ok: true };
    },
  ],
  ['GET', /^\/api\/spaces\/([a-z0-9-]+)\/branches\/compare$/, (req, res, [id]) =>
    store.compareBranches(id),
  ],

  // ---- outputs
  ['GET', /^\/api\/spaces\/([a-z0-9-]+)\/outputs$/, (req, res, [id]) => store.listOutputs(id)],
  [
    'POST',
    /^\/api\/spaces\/([a-z0-9-]+)\/outputs$/,
    async (req, res, [id]) => store.saveOutput(id, await readJsonBody(req)),
  ],
  ['GET', /^\/api\/spaces\/([a-z0-9-]+)\/outputs\/([a-z0-9-]+)$/, (req, res, [id, oid]) =>
    store.readOutput(id, oid),
  ],
  [
    'PUT',
    /^\/api\/spaces\/([a-z0-9-]+)\/outputs\/([a-z0-9-]+)$/,
    async (req, res, [id, oid]) => store.updateOutput(id, oid, await readJsonBody(req)),
  ],
  [
    'DELETE',
    /^\/api\/spaces\/([a-z0-9-]+)\/outputs\/([a-z0-9-]+)$/,
    (req, res, [id, oid]) => {
      store.deleteOutput(id, oid);
      return { ok: true };
    },
  ],

  // ---- workstreams
  ['GET', /^\/api\/spaces\/([a-z0-9-]+)\/workstreams$/, (req, res, [id]) =>
    listWorkstreams(id, readToolShed()).map(({ prompt, offlineTemplate, ...pub }) => pub),
  ],

  // ---- processes
  ['GET', /^\/api\/spaces\/([a-z0-9-]+)\/processes$/, (req, res, [id]) =>
    proc.listSpaceProcesses(id),
  ],
  [
    'POST',
    /^\/api\/spaces\/([a-z0-9-]+)\/processes$/,
    async (req, res, [id]) => {
      const { workstreamId, input } = await readJsonBody(req);
      const toolShed = readToolShed();
      const workstream = getWorkstream(id, workstreamId, toolShed);
      if (!workstream) throw new HttpError(404, `Unknown workstream: ${workstreamId}`);
      if (!workstream.available) {
        throw new HttpError(
          409,
          `Workstream "${workstream.name}" needs tools not configured in the Tool Shed: ${workstream.missingTools.join(', ')}`
        );
      }
      return proc.startProcess(id, workstream, toolShed, input);
    },
  ],
  ['GET', /^\/api\/processes\/([a-z0-9-]+)$/, (req, res, [pid]) => proc.getProcess(pid)],
  [
    'GET',
    /^\/api\/processes\/([a-z0-9-]+)\/stream$/,
    (req, res, [pid]) => {
      proc.subscribe(pid, res);
      return undefined; // response handled by SSE
    },
  ],
  ['POST', /^\/api\/processes\/([a-z0-9-]+)\/stop$/, (req, res, [pid]) => proc.stopProcess(pid)],
  [
    'POST',
    /^\/api\/processes\/([a-z0-9-]+)\/visibility$/,
    async (req, res, [pid]) => {
      const { visibility } = await readJsonBody(req);
      return proc.setVisibility(pid, visibility);
    },
  ],
  [
    'POST',
    /^\/api\/processes\/([a-z0-9-]+)\/save-output$/,
    async (req, res, [pid]) => proc.saveProcessAsOutput(pid, await readJsonBody(req)),
  ],

  // ---- tool shed
  ['GET', /^\/api\/toolshed$/, () => maskToolShed(readToolShed())],
  ['PUT', /^\/api\/toolshed$/, async (req) => maskToolShed(writeToolShed(await readJsonBody(req)))],

  ['GET', /^\/api\/health$/, () => ({ ok: true, home: WORKBENCH_HOME })],
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
proc.reconcileOnBoot();
server.listen(PORT, () => {
  console.log(`\n  Workbench is running:  http://localhost:${PORT}`);
  console.log(`  Your orchard lives in: ${WORKBENCH_HOME}\n`);
});
