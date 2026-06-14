import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './util.js';

/**
 * The gstack skill catalog: a bundled, offline list of gstack's slash-command
 * skills grouped into the sprint pipeline. Read once at startup; the UI exposes
 * it so the browser can render phases and the skills under each.
 */

const CATALOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'catalog.json');

const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));

const byId = new Map(raw.skills.map((s) => [s.id, s]));

/** Phases in pipeline order, each with its skills attached. */
export function getCatalog() {
  return raw.pipeline.map((phaseId) => ({
    id: phaseId,
    ...raw.phases[phaseId],
    skills: raw.skills.filter((s) => s.phase === phaseId),
  }));
}

export function getSkill(skillId) {
  const skill = byId.get(skillId);
  if (!skill) throw new HttpError(404, `Unknown gstack skill: ${skillId}`);
  return skill;
}
