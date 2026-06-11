# Workbench HTTP API

All endpoints are JSON under `/api/`. The UI is a static SPA served from `/`.

## Orchard
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/orchard` | — | Idea Space summaries (title, preview, counts, running processes) |
| POST | `/api/orchard` | `{ seedText, title? }` | new space settings (plants a Seed) |

## Idea Space
| GET | `/api/spaces/:id` | — | settings + seed + understanding + branches + counts (touches `lastOpenedAt`) |
| PUT | `/api/spaces/:id/understanding` | `{ content }` | saves Current Understanding on the current branch |

## Branches
| GET | `/api/spaces/:id/branches` | — | `{ currentBranch, branches[] }` |
| POST | `/api/spaces/:id/branches` | `{ name, note?, startingUnderstanding?, checkout? }` | creates (and by default switches to) a branch |
| POST | `/api/spaces/:id/branches/switch` | `{ name }` | switches the current branch |
| POST | `/api/spaces/:id/branches/rename` | `{ oldName, newName }` | renames a branch |
| GET | `/api/spaces/:id/branches/compare` | — | every branch with its full understanding |

## Outputs
| GET | `/api/spaces/:id/outputs` | — | output summaries |
| POST | `/api/spaces/:id/outputs` | `{ title, type?, workstream?, content }` | saves a new output |
| GET/PUT/DELETE | `/api/spaces/:id/outputs/:oid` | `{ title?, content? }` on PUT | read / edit / delete |

## Workstreams & Processes
| GET | `/api/spaces/:id/workstreams` | — | workstream defs with `available` / `missingTools` |
| GET | `/api/spaces/:id/processes` | — | process records, newest first |
| POST | `/api/spaces/:id/processes` | `{ workstreamId }` | starts a process (409 if required tools missing) |
| GET | `/api/processes/:pid` | — | one process record |
| GET | `/api/processes/:pid/stream` | — | **SSE**: `snapshot` (full record so far) → `chunk` (text) → `end` (status) |
| POST | `/api/processes/:pid/stop` | — | aborts a running process |
| POST | `/api/processes/:pid/visibility` | `{ visibility }` | `foreground` \| `background` (UI-only flag) |
| POST | `/api/processes/:pid/save-output` | `{ title? }` | saves the result as an Output |

## Tool Shed
| GET | `/api/toolshed` | — | config with API keys masked |
| PUT | `/api/toolshed` | partial config | merges and saves; masked `••••` keys keep the stored secret |
