import { readWeb, writeWeb } from './store.js';
import { embedTexts, complete } from './providers.js';
import { HttpError, nowIso, uuid } from './util.js';

/**
 * The mapper: turns a "kept" fragment into a node on the space's concept web.
 *
 * On a keep it embeds the text, finds the nearest existing nodes, places the new
 * node by meaning (unless the user dragged it somewhere specific), and asks the
 * model for a short label. Everything degrades gracefully: with no embedding
 * provider there are simply no auto-connections and the label is derived from
 * the text. Vectors live in the web file; similarity is plain in-memory cosine —
 * no vector database at personal scale.
 */

const FAMILIARITIES = ['unknown', 'unfamiliar', 'somewhat', 'known'];

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function neighborsOf(embedding, nodes, { exclude, k = 5 } = {}) {
  if (!embedding) return [];
  return nodes
    .filter((n) => n.id !== exclude && Array.isArray(n.embedding))
    .map((n) => ({ id: n.id, score: cosine(embedding, n.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Meaning seeds a node's position: place it among its nearest neighbours. */
function placeNear(neighbors, nodesById) {
  if (!neighbors.length) {
    const a = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * 90;
    return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) };
  }
  let x = 0;
  let y = 0;
  let w = 0;
  for (const nb of neighbors) {
    const n = nodesById[nb.id];
    if (!n?.position) continue;
    const weight = Math.max(nb.score, 0.01);
    x += n.position.x * weight;
    y += n.position.y * weight;
    w += weight;
  }
  if (!w) {
    const a = Math.random() * Math.PI * 2;
    return { x: Math.round(Math.cos(a) * 150), y: Math.round(Math.sin(a) * 150) };
  }
  return {
    x: Math.round(x / w + (Math.random() - 0.5) * 70),
    y: Math.round(y / w + (Math.random() - 0.5) * 70),
  };
}

function deriveLabel(text) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  return words.length > 60 ? `${words.slice(0, 57)}…` : words;
}

async function proposeLabel(toolShed, text) {
  if ((toolShed.activeProvider || 'offline') === 'offline') return null;
  try {
    const out = await complete(toolShed, {
      system:
        'You name concepts. Reply with ONLY a 2 to 5 word lowercase noun phrase ' +
        'naming the core concept in the text. No punctuation, no quotes, no preamble.',
      prompt: text.slice(0, 1200),
    });
    const label = out
      .trim()
      .split('\n')[0]
      .replace(/^["'#\s.-]+|["'.\s]+$/g, '')
      .slice(0, 60);
    return label || null;
  } catch {
    return null;
  }
}

/** Strip the heavy embedding for the wire; attach computed latent neighbours. */
function publicNode(node, allNodes) {
  const { embedding, ...rest } = node;
  return {
    ...rest,
    hasEmbedding: Boolean(embedding),
    neighbors: embedding ? neighborsOf(embedding, allNodes, { exclude: node.id, k: 5 }) : [],
  };
}

export function getWeb(spaceId) {
  const web = readWeb(spaceId);
  const nodes = Object.values(web.nodes);
  return { nodes: nodes.map((n) => publicNode(n, nodes)), edges: web.edges || [] };
}

export async function keepNode(spaceId, body, toolShed) {
  const text = (body?.text || '').trim();
  if (!text) throw new HttpError(400, 'Node text is required');

  const web = readWeb(spaceId);
  if (!web.nodes) web.nodes = {};
  const existing = Object.values(web.nodes);

  const [embedding] = await embedTexts(toolShed, [text.slice(0, 4000)]);
  const neighbors = neighborsOf(embedding, existing, { k: 5 });
  const position =
    body.position && Number.isFinite(body.position.x) && Number.isFinite(body.position.y)
      ? { x: Math.round(body.position.x), y: Math.round(body.position.y) }
      : placeNear(neighbors, web.nodes);
  const label =
    (body.label && body.label.trim()) || (await proposeLabel(toolShed, text)) || deriveLabel(text);

  const now = nowIso();
  const node = {
    id: uuid(),
    label,
    text,
    provenance: body.provenance || null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    familiarity: FAMILIARITIES.includes(body.familiarity) ? body.familiarity : 'unknown',
    source: 'inferred',
    embedding: embedding || null,
    position,
    links: [],
    createdAt: now,
    updatedAt: now,
  };
  web.nodes[node.id] = node;
  writeWeb(spaceId, web);
  return publicNode(node, Object.values(web.nodes));
}

export function editNode(spaceId, nodeId, patch) {
  const web = readWeb(spaceId);
  const node = web.nodes?.[nodeId];
  if (!node) throw new HttpError(404, `Node not found: ${nodeId}`);

  if (patch.position && Number.isFinite(patch.position.x) && Number.isFinite(patch.position.y)) {
    node.position = { x: Math.round(patch.position.x), y: Math.round(patch.position.y) };
  }
  if (typeof patch.label === 'string' && patch.label.trim()) node.label = patch.label.trim().slice(0, 80);
  if (FAMILIARITIES.includes(patch.familiarity)) {
    node.familiarity = patch.familiarity;
    node.source = 'user'; // a user's correction is never overwritten by a later AI merge
  }
  if (typeof patch.note === 'string') node.note = patch.note;
  if (Array.isArray(patch.tags)) node.tags = patch.tags;
  node.updatedAt = nowIso();
  web.nodes[nodeId] = node;
  writeWeb(spaceId, web);
  return publicNode(node, Object.values(web.nodes));
}

export function deleteNode(spaceId, nodeId) {
  const web = readWeb(spaceId);
  if (!web.nodes?.[nodeId]) throw new HttpError(404, `Node not found: ${nodeId}`);
  delete web.nodes[nodeId];
  web.edges = (web.edges || []).filter((e) => e.from !== nodeId && e.to !== nodeId);
  writeWeb(spaceId, web);
  return { ok: true };
}
