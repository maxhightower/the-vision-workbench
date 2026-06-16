import { readCustomWorkstreams } from './store.js';
import { isSearchConfigured } from './toolshed.js';

/**
 * Workstreams are pluggable workflows. Each definition declares:
 *   id, name, description   — what it is
 *   requiredTools           — tools that must be configured (e.g. 'search')
 *   outputType, outputTitle — how the saved Output is labelled
 *   prompt(ctx)             — builds the model prompt from { seed, understanding }
 *   offlineTemplate         — fill-in skeleton used when no provider is configured
 *
 * Idea Spaces can add custom workstreams by dropping JSON files into
 * .workbench/workstreams/ with { id, name, description, promptTemplate,
 * outputType, outputTitle } — {{seed}} and {{understanding}} are substituted.
 */

const SYSTEM_PROMPT =
  'You are Workbench, an Idea Developer. You help people take an early, ' +
  'unpolished idea (a "Seed") and develop it with rigor and warmth. ' +
  'Be concrete and specific to THIS idea — never generic. ' +
  'Respond in clean Markdown with the exact section structure requested. ' +
  'Do not add preamble or closing remarks.';

function modeGuidance(mode) {
  if (mode !== 'learning') return '';
  return (
    '## Posture: Learning (accessibility, not solving)\n\n' +
    'Operate as an accessibility tool, not a problem-solver. Do NOT deliver a finished solution. ' +
    'Instead: surface only the most relevant information and the single most useful next consideration; ' +
    'propose ONE small, concrete next step the user can take themselves; then stop and invite their ' +
    'feedback before going further. Move in small steps, never leaps. Frame what the user does not yet ' +
    'know as an approachable next move, not a deficiency.\n\n'
  );
}

function context(ctx) {
  const tags = ctx.tags?.length
    ? `## Intent tags\n\nThe user chose these tags to direct the vision and intent of this idea — let them steer your interpretation: ${ctx.tags.join(', ')}\n\n`
    : '';
  return (
    modeGuidance(ctx.mode) +
    tags +
    `## The original Seed (raw idea as the user first wrote it)\n\n${ctx.seed.trim()}\n\n` +
    `## Current Understanding (the evolving interpretation, branch "${ctx.branch}")\n\n` +
    `${ctx.understanding.trim()}\n\n---\n\n`
  );
}

export const BUILT_IN_WORKSTREAMS = [
  {
    id: 'cultivate-seed',
    name: 'Cultivate Seed',
    description: 'Refine the raw seed into a clearer Current Understanding, surface key themes and missing details.',
    requiredTools: [],
    outputType: 'current_understanding',
    outputTitle: 'Cultivated Understanding',
    prompt: (ctx) =>
      context(ctx) +
      'Cultivate this seed. Produce exactly these sections:\n\n' +
      '## Current Understanding (revised)\nA clearer, fuller restatement of the idea in the user\'s spirit — 2 to 4 paragraphs. This must stand alone; the user may replace their Current Understanding with it verbatim.\n\n' +
      '## Key Themes\n3–6 bullets naming the core themes inside the idea.\n\n' +
      '## Missing Details\n3–6 bullets of concrete questions or gaps the user should resolve next.',
    offlineTemplate:
      '## Current Understanding (revised)\n\n_Restate the idea more clearly here._\n\n' +
      '## Key Themes\n\n- \n- \n- \n\n' +
      '## Missing Details\n\n- \n- \n- \n',
  },
  {
    id: 'refine-understanding',
    name: 'Refine Understanding',
    description: 'Tell Workbench what it got wrong or what to develop further; it rewrites the Current Understanding to honor your guidance.',
    requiredTools: [],
    inputs: [
      {
        key: 'guidance',
        label: 'Your guidance',
        type: 'textarea',
        required: true,
        placeholder: 'What did Workbench get wrong? What matters more than it realizes? What should be developed further?',
      },
    ],
    outputType: 'current_understanding',
    outputTitle: 'Refined Understanding',
    prompt: (ctx) =>
      context(ctx) +
      `The user has reviewed the Current Understanding and responds with this guidance:\n\n` +
      `"""\n${ctx.input.guidance.trim()}\n"""\n\n` +
      'Rewrite the Current Understanding so it truly reflects what the user means. ' +
      'Treat the guidance as authoritative: where it conflicts with the previous understanding, the guidance wins. ' +
      'Keep everything from the previous understanding that the guidance does not touch. ' +
      'Produce exactly these sections:\n\n' +
      '## Current Understanding (revised)\nThe full corrected understanding — 2 to 4 paragraphs. It must stand alone; the user may replace their Current Understanding with it verbatim.\n\n' +
      '## What Changed\n2–5 bullets: what you corrected, reweighted, or developed, and why.\n\n' +
      '## Open Questions\n2–4 bullets: what the guidance implies but leaves unresolved.',
    offlineTemplate:
      '## Current Understanding (revised)\n\n_Rewrite the understanding here, honoring your own guidance._\n\n' +
      '## What Changed\n\n- \n- \n\n' +
      '## Open Questions\n\n- \n- \n',
  },
  {
    id: 'generate-branches',
    name: 'Generate Branches',
    description: 'Propose 3–5 alternate directions the idea could grow in. Create a branch from any of them.',
    requiredTools: [],
    outputType: 'branch_directions',
    outputTitle: 'Branch Directions',
    prompt: (ctx) =>
      context(ctx) +
      'Propose 3 to 5 meaningfully different directions this idea could grow in. ' +
      'Use EXACTLY this format for each, so the directions can be parsed:\n\n' +
      '### Branch: <2-4 word lowercase-dash-name>\n' +
      'One short paragraph: what this direction is, who it serves, and what changes versus the current understanding.\n\n' +
      'Make the directions genuinely divergent (different audience, scope, business model, or core mechanic), not cosmetic variations.',
    offlineTemplate:
      '### Branch: direction-one\n\n_Describe an alternate direction._\n\n' +
      '### Branch: direction-two\n\n_Describe another direction._\n\n' +
      '### Branch: direction-three\n\n_And a third._\n',
  },
  {
    id: 'prune-scope',
    name: 'Prune Scope',
    description: 'Cut the idea down to an MVP: what is in, what comes later, what is explicitly out.',
    requiredTools: [],
    outputType: 'mvp_scope',
    outputTitle: 'Pruned Scope',
    prompt: (ctx) =>
      context(ctx) +
      'Prune this idea\'s scope ruthlessly. Produce exactly these sections:\n\n' +
      '## MVP Scope\nThe smallest version that proves the core value — concrete bullets.\n\n' +
      '## Later Features\nGood ideas that should wait — bullets with one-line reasons to defer.\n\n' +
      '## Non-Goals\nThings this idea should explicitly NOT try to be — bullets.',
    offlineTemplate:
      '## MVP Scope\n\n- \n- \n\n## Later Features\n\n- \n- \n\n## Non-Goals\n\n- \n- \n',
  },
  {
    id: 'test-the-pitch',
    name: 'Test the Pitch',
    description: 'Generate one-liners and positioning options, then critique the idea\'s clarity.',
    requiredTools: [],
    outputType: 'pitch_variants',
    outputTitle: 'Pitch Variants',
    prompt: (ctx) =>
      context(ctx) +
      'Test how this idea pitches. Produce exactly these sections:\n\n' +
      '## One-Liners\n5 distinct one-sentence pitches, numbered, each taking a different angle.\n\n' +
      '## Positioning Options\n2–3 ways to position this (versus what alternative, for whom), as short labelled paragraphs.\n\n' +
      '## Clarity Critique\nWhere the idea is hard to explain, which words are doing too much work, and what is most confusing to a newcomer.',
    offlineTemplate:
      '## One-Liners\n\n1. \n2. \n3. \n\n## Positioning Options\n\n- \n\n## Clarity Critique\n\n- \n',
  },
  {
    id: 'find-weak-roots',
    name: 'Find Weak Roots',
    description: 'Surface assumptions, contradictions, missing information, and risky unknowns.',
    requiredTools: [],
    outputType: 'weak_roots',
    outputTitle: 'Weak Roots',
    prompt: (ctx) =>
      context(ctx) +
      'Stress-test this idea\'s foundations. Produce exactly these sections:\n\n' +
      '## Assumptions\nBeliefs the idea silently depends on — bullets, most load-bearing first.\n\n' +
      '## Contradictions\nPlaces where the idea is in tension with itself — bullets (write "None found" if truly none).\n\n' +
      '## Missing Information\nFacts the user does not yet have but needs — bullets.\n\n' +
      '## Risky Unknowns\nThe unknowns most likely to kill the idea, each with a cheap way to test it.',
    offlineTemplate:
      '## Assumptions\n\n- \n- \n\n## Contradictions\n\n- \n\n' +
      '## Missing Information\n\n- \n- \n\n## Risky Unknowns\n\n- \n',
  },
  {
    id: 'market-scan',
    name: 'Market Scan',
    description: 'Adjacent tools, possible competitors, positioning risks, and target user hypotheses. Requires a search tool.',
    requiredTools: ['search'],
    outputType: 'market_notes',
    outputTitle: 'Market Notes',
    prompt: (ctx) =>
      context(ctx) +
      'Scan the market landscape around this idea from your knowledge. ' +
      'Be explicit when you are uncertain or your knowledge may be stale. Produce exactly these sections:\n\n' +
      '## Adjacent Tools\nTools/products in the same space — bullets with one-line descriptions.\n\n' +
      '## Possible Competitors\nWho competes most directly, and on what.\n\n' +
      '## Positioning Risks\nWays this idea could be drowned out or mis-categorized.\n\n' +
      '## Target User Hypotheses\n2–3 candidate first-user profiles and why each might adopt early.',
    offlineTemplate:
      '## Adjacent Tools\n\n- \n\n## Possible Competitors\n\n- \n\n' +
      '## Positioning Risks\n\n- \n\n## Target User Hypotheses\n\n- \n',
  },
];

function customToDef(raw) {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || '',
    requiredTools: raw.requiredTools || [],
    inputs: raw.inputs || [],
    outputType: raw.outputType || 'note',
    outputTitle: raw.outputTitle || raw.name,
    custom: true,
    prompt: (ctx) =>
      raw.promptTemplate
        .replaceAll('{{seed}}', ctx.seed)
        .replaceAll('{{understanding}}', ctx.understanding)
        .replace(/\{\{input\.([a-zA-Z0-9_-]+)\}\}/g, (_, key) => ctx.input[key] || ''),
    offlineTemplate: raw.offlineTemplate || '_Fill in by hand (custom workstream)._\n',
  };
}

/** All workstreams for a space, with availability based on the tool shed. */
export function listWorkstreams(spaceId, toolShed) {
  const custom = spaceId ? readCustomWorkstreams(spaceId).map(customToDef) : [];
  return [...BUILT_IN_WORKSTREAMS, ...custom].map((ws) => {
    const missingTools = ws.requiredTools.filter((tool) => {
      if (tool === 'search') return !isSearchConfigured(toolShed);
      return true;
    });
    return { ...ws, inputs: ws.inputs || [], available: missingTools.length === 0, missingTools };
  });
}

export function getWorkstream(spaceId, workstreamId, toolShed) {
  return listWorkstreams(spaceId, toolShed).find((ws) => ws.id === workstreamId) || null;
}

export { SYSTEM_PROMPT };
