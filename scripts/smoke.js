/**
 * End-to-end smoke test of gstack UI against a running server, using a fake
 * Claude Code binary so it needs no real install:
 *   catalog → settings → add project → run skill (stream-json) → history → stop.
 *
 * Usage:
 *   GSTACK_UI_HOME=$(mktemp -d) PORT=4810 node server/index.js &
 *   node scripts/smoke.js
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:4810';
let failures = 0;

function check(name, cond, detail = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`);
  if (!cond) failures++;
}

async function req(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${data.error}`);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Write a fake `claude` that emits a couple of stream-json lines and exits 0.
function makeFakeClaude() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gstack-fake-'));
  const js = path.join(dir, 'claude.js');
  fs.writeFileSync(
    js,
    `const a=process.argv.slice(2);const p=a[a.indexOf('-p')+1]||'';const o=x=>process.stdout.write(JSON.stringify(x)+'\\n');` +
      `o({type:'assistant',message:{content:[{type:'text',text:'Ran '+p+'\\n'}]}});` +
      `o({type:'result',subtype:'success',is_error:false,result:'ok'});`
  );
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, `#!/bin/sh\nexec node ${js} "$@"\n`);
  fs.chmodSync(bin, 0o755);
  return { bin, project: dir };
}

async function main() {
  console.log('\ngstack UI smoke test\n');
  const { bin, project } = makeFakeClaude();

  const catalog = await req('GET', '/api/catalog');
  check('catalog has phases + skills', catalog.length > 0 && catalog[0].skills.length > 0);

  const settings = await req('PUT', '/api/settings', { claudeBin: bin, permissionMode: 'acceptEdits' });
  check('settings save claude binary', settings.claudeBin === bin);

  const created = await req('POST', '/api/projects', { name: 'Smoke', path: project });
  check('add project', !!created.id && created.path === fs.realpathSync(project), created.path);

  await req('GET', `/api/projects/${created.id}`);
  check('get project', true);

  const run = await req('POST', `/api/projects/${created.id}/runs`, { skillId: 'review', args: 'x' });
  check('start run builds command', /\/review x/.test(run.command), run.command);
  check('run is in project cwd', run.cwd === fs.realpathSync(project));

  await sleep(800);
  const finished = await req('GET', `/api/runs/${run.id}`);
  check('run completes', finished.status === 'completed', finished.status + ' ' + finished.error);
  check('run captured output', /Ran \/review x/.test(finished.output), finished.output);

  const runs = await req('GET', `/api/projects/${created.id}/runs`);
  check('run appears in history', runs.some((r) => r.id === run.id));

  await req('DELETE', `/api/projects/${created.id}`);
  const after = await req('GET', '/api/projects');
  check('remove project', !after.some((p) => p.id === created.id));

  console.log(`\n${failures ? `✗ ${failures} failure(s)` : '✓ all checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('\n✗ smoke test crashed:', err.message, '\n');
  process.exit(1);
});
