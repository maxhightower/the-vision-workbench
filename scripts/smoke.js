/**
 * End-to-end smoke test of the MVP loop against a running server (offline
 * provider): plant seed → edit understanding → run workstream → hide/show →
 * save output → branch ops → outputs CRUD → tool shed.
 *
 * Usage:  WORKBENCH_HOME=$(mktemp -d) node server/index.js &
 *         node scripts/smoke.js
 */

const BASE = process.env.BASE || 'http://localhost:4810';
let failures = 0;

function check(name, cond, detail = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`);
  if (!cond) failures++;
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.error}`);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('Workbench smoke test\n');

// 1. Orchard + plant a seed
const seed = await req('POST', '/api/orchard', {
  seedText: 'A pocket greenhouse that texts you when your basil is sad.',
  title: 'Sad Basil',
  tags: ['product', 'Hardware Thing', 'product', '!!bad!!'],
});
check('plant seed creates idea space', seed.id && seed.currentBranch === 'main');
check('tags sanitized and deduped', JSON.stringify(seed.tags) === '["product","hardware-thing"]', JSON.stringify(seed.tags));

await req('PUT', `/api/spaces/${seed.id}/tags`, { tags: ['product', 'experiment'] });
const tagged = await req('GET', `/api/spaces/${seed.id}`);
check('tags are editable', JSON.stringify(tagged.tags) === '["product","experiment"]');

const orchard = await req('GET', '/api/orchard');
check('orchard lists the space', orchard.some((s) => s.id === seed.id));

// 2. Space + editable understanding
const space = await req('GET', `/api/spaces/${seed.id}`);
check('space returns seed text', space.seed.includes('basil'));
check('understanding starts as seed', space.understanding.includes('basil'));

await req('PUT', `/api/spaces/${seed.id}/understanding`, {
  content: 'A tiny IoT greenhouse with plant-mood notifications.',
});
const edited = await req('GET', `/api/spaces/${seed.id}`);
check('understanding is editable', edited.understanding.includes('IoT greenhouse'));

// 3. Workstreams (offline provider) — market scan gated by tool shed
const workstreams = await req('GET', `/api/spaces/${seed.id}/workstreams`);
check('7 built-in workstreams', workstreams.length === 7, `got ${workstreams.length}`);
const marketScan = workstreams.find((w) => w.id === 'market-scan');
check('market scan unavailable without search tool', marketScan.available === false);
const refine = workstreams.find((w) => w.id === 'refine-understanding');
check('refine declares a required guidance input', refine.inputs?.[0]?.key === 'guidance' && refine.inputs[0].required);

// 3b. Refine Understanding: input validation + run
const noInput = await fetch(`${BASE}/api/spaces/${seed.id}/processes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ workstreamId: 'refine-understanding' }),
});
check('refine without guidance is rejected', noInput.status === 400);

let refineProc = await req('POST', `/api/spaces/${seed.id}/processes`, {
  workstreamId: 'refine-understanding',
  input: { guidance: 'It is not about IoT hardware — the core is the notification personality.' },
});
check('refine process stores input', refineProc.input.guidance.includes('notification personality'));
for (let i = 0; i < 40 && refineProc.status === 'running'; i++) {
  await sleep(250);
  refineProc = await req('GET', `/api/processes/${refineProc.id}`);
}
check('refine completes with revised-understanding section',
  refineProc.status === 'completed' && refineProc.output.includes('Current Understanding (revised)'),
  refineProc.status);

// 4. Run a process, hide it, let it finish in background
const proc1 = await req('POST', `/api/spaces/${seed.id}/processes`, {
  workstreamId: 'prune-scope',
});
check('process starts in foreground', proc1.status === 'running' && proc1.visibility === 'foreground');

await req('POST', `/api/processes/${proc1.id}/visibility`, { visibility: 'background' });
let rec = await req('GET', `/api/processes/${proc1.id}`);
check('process can be hidden', rec.visibility === 'background');

for (let i = 0; i < 40 && rec.status === 'running'; i++) {
  await sleep(250);
  rec = await req('GET', `/api/processes/${proc1.id}`);
}
check('hidden process completes', rec.status === 'completed', rec.status);
check('offline mode produced template output', rec.output.includes('MVP Scope'));

// 5. Save process result as output
const saved = await req('POST', `/api/processes/${proc1.id}/save-output`, { title: 'Scope v1' });
check('process saved as output', saved.output.id && saved.process.savedOutputId === saved.output.id);

// 6. Stop a running process
const proc2 = await req('POST', `/api/spaces/${seed.id}/processes`, {
  workstreamId: 'find-weak-roots',
});
await req('POST', `/api/processes/${proc2.id}/stop`);
await sleep(200);
const stopped = await req('GET', `/api/processes/${proc2.id}`);
check('process can be stopped', stopped.status === 'stopped', stopped.status);

// 7. Branches: create, switch, rename, compare
await req('POST', `/api/spaces/${seed.id}/branches`, {
  name: 'b2b-pivot',
  startingUnderstanding: '## Direction: b2b\n\nSell to plant shops.',
});
let branches = await req('GET', `/api/spaces/${seed.id}/branches`);
check('create branch switches to it', branches.currentBranch === 'b2b-pivot');

const cuOnBranch = await req('GET', `/api/spaces/${seed.id}`);
check('branch inherits + layers direction', cuOnBranch.understanding.includes('plant shops') && cuOnBranch.understanding.includes('IoT greenhouse'));

await req('POST', `/api/spaces/${seed.id}/branches/switch`, { name: 'main' });
branches = await req('GET', `/api/spaces/${seed.id}/branches`);
check('switch branch', branches.currentBranch === 'main');

await req('POST', `/api/spaces/${seed.id}/branches/rename`, { oldName: 'b2b-pivot', newName: 'shops' });
const compared = await req('GET', `/api/spaces/${seed.id}/branches/compare`);
check('rename + compare branches', compared.length === 2 && compared.some((b) => b.name === 'shops'));

// 8. Outputs: list, edit, hand-entered note, delete
let outputs = await req('GET', `/api/spaces/${seed.id}/outputs`);
check('outputs lists saved result', outputs.some((o) => o.title === 'Scope v1'));

const oid = outputs[0].id;
await req('PUT', `/api/spaces/${seed.id}/outputs/${oid}`, { content: 'edited content' });
const reread = await req('GET', `/api/spaces/${seed.id}/outputs/${oid}`);
check('outputs are editable', reread.content.trim() === 'edited content');

const note = await req('POST', `/api/spaces/${seed.id}/outputs`, {
  title: 'Open Questions',
  type: 'note',
  content: '- can basil even be sad?',
});
await req('DELETE', `/api/spaces/${seed.id}/outputs/${note.id}`);
outputs = await req('GET', `/api/spaces/${seed.id}/outputs`);
check('note created and deleted', !outputs.some((o) => o.id === note.id));

// 9. Tool shed: save config, masking, market scan unlock
await req('PUT', '/api/toolshed', {
  providers: { anthropic: { apiKey: 'sk-test-secret' } },
  tools: { search: { enabled: true } },
});
const shed = await req('GET', '/api/toolshed');
check('api keys are masked', shed.providers.anthropic.apiKey === '••••••••' && shed.providers.anthropic.hasApiKey);

// masked value round-trip must not clobber the stored secret
await req('PUT', '/api/toolshed', { providers: { anthropic: { apiKey: '••••••••' } } });
const shed2 = await req('GET', '/api/toolshed');
check('masked key round-trip keeps secret', shed2.providers.anthropic.hasApiKey === true);

const ws2 = await req('GET', `/api/spaces/${seed.id}/workstreams`);
check('market scan unlocks with search tool', ws2.find((w) => w.id === 'market-scan').available);

// 10. Reopen later: lastOpenedAt is touched
const summary = (await req('GET', '/api/orchard')).find((s) => s.id === seed.id);
check('orchard metadata complete', summary.branchesCount === 2 && summary.outputsCount === 1);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
