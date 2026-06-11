# Workbench data model

Workbench is local-first: every entity below is a plain file or folder under
`WORKBENCH_HOME` (default `~/Workbench`). Nothing lives only in a hidden app
database; you can read, edit, back up, or version the whole tree yourself.

## Entities

### Orchard
The collection of Idea Spaces. On disk it is simply the
`<WORKBENCH_HOME>/orchard/` directory; every subfolder containing
`.workbench/settings.json` is an Idea Space. Orchard metadata (title, preview,
counts, last opened) is derived at read time — there is no separate index to
fall out of sync.

### IdeaSpace
One folder per idea: `orchard/<slug>/`. The slug is the stable id.

`.workbench/settings.json`:
```json
{
  "id": "my-idea",
  "uuid": "f4f9…",
  "title": "My Idea",
  "createdAt": "2026-06-11T18:00:00.000Z",
  "lastOpenedAt": "2026-06-11T19:00:00.000Z",
  "currentBranch": "main"
}
```

### Seed
`.workbench/seed.md` — the user's original raw idea text. Written once when
the space is planted and never overwritten; it is the fixed point every
workstream can refer back to.

### CurrentUnderstanding
`branches/<branch>/current_understanding.md` — Workbench's evolving
interpretation of the Seed, **per branch**. Freely editable by the user;
saving from the Core view writes this file directly.

### Branch
A lightweight alternate direction of the idea ("branch" is the product
metaphor, not git). Each branch is a folder under `branches/` holding its own
Current Understanding. Metadata in `.workbench/branches.json`:
```json
[
  { "name": "main", "createdAt": "…", "updatedAt": "…", "note": "Original direction" },
  { "name": "b2b-pivot", "createdAt": "…", "updatedAt": "…", "note": "From Generate Branches: …" }
]
```
`settings.currentBranch` selects the active one. Switching is instant
(no working-tree mutation); comparing reads every branch's understanding
side by side. V1 has create/switch/rename/compare — no merging.

### Workstream
A pluggable workflow definition:
```
{ id, name, description, requiredTools[], inputs[], outputType, outputTitle,
  prompt(ctx), offlineTemplate }
```
Built-ins live in `server/workstreams.js`. A workstream is *available* when
its `requiredTools` are configured in the Tool Shed (e.g. Market Scan needs
`search`).

`inputs` is the workstream's input schema: fields the user must provide when
starting a process, e.g. Refine Understanding declares
`[{ key: "guidance", label, type: "textarea", required: true, placeholder }]`.
The UI renders a form for them; the server validates required fields (400 on
missing) and stores the values on the process record. In prompts the values
appear as `ctx.input.<key>`.

Custom workstreams can be added per space as
`.workbench/workstreams/<name>.json`:
```json
{
  "id": "devil-advocate",
  "name": "Devil's Advocate",
  "description": "Argue against the idea as hard as possible.",
  "inputs": [{ "key": "angle", "label": "Attack from this angle", "required": false }],
  "outputType": "critique",
  "outputTitle": "Devil's Advocate",
  "promptTemplate": "Seed:\n{{seed}}\n\nUnderstanding:\n{{understanding}}\n\nAngle: {{input.angle}}\n\nArgue against this idea…"
}
```

### Process
A running instance of a Workstream. Records persist in
`.workbench/processes.json` (most recent first, capped at 100); live output is
buffered in server memory and streamed to the UI over SSE.
```json
{
  "id": "uuid",
  "spaceId": "my-idea",
  "workstreamId": "prune-scope",
  "workstreamName": "Prune Scope",
  "outputType": "mvp_scope",
  "branch": "main",
  "provider": "ollama",
  "input": { "guidance": "…user-provided workstream input, if any…" },
  "status": "running | completed | failed | stopped",
  "visibility": "foreground | background",
  "startedAt": "…", "endedAt": "…",
  "output": "…accumulated markdown…",
  "error": null,
  "savedOutputId": null
}
```
`visibility` is purely a UI concept: background processes keep running and can
be reopened with their full output replayed. Process results are temporary
until saved as an Output. Processes left `running` by a dead server are marked
`stopped` on boot.

### Output
A saved result (generated or hand-entered): one markdown file with
frontmatter in `outputs/`, editable in place.
```markdown
---
title: Pruned Scope (main)
type: mvp_scope
workstream: prune-scope
branch: main
createdAt: 2026-06-11T19:05:00.000Z
---
## MVP Scope
…
```
`type` values used by built-ins: `current_understanding`, `branch_directions`,
`mvp_scope`, `pitch_variants`, `weak_roots`, `market_notes`, `note`.

### ToolShedConfig
Global, at `<WORKBENCH_HOME>/tool_shed.json`:
```json
{
  "activeProvider": "ollama",
  "providers": {
    "openai-compatible": { "baseUrl": "…", "apiKey": "…", "model": "…" },
    "anthropic":         { "apiKey": "…", "model": "claude-sonnet-4-6" },
    "ollama":            { "baseUrl": "http://localhost:11434", "model": "llama3.1" },
    "offline":           {}
  },
  "tools": { "search": { "enabled": false } }
}
```
API keys are stored locally only and masked in every API response
(`hasApiKey` + `••••••••`). The `offline` provider needs no configuration and
turns every workstream into a structured fill-in template.

## Safety boundaries

- All write paths validate ids/branch names against `[a-z0-9-]` patterns and
  resolve inside the Idea Space folder — a process cannot touch files outside
  its space.
- V1 processes have exactly one side effect channel: the configured model API.
