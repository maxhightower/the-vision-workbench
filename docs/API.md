# gstack UI HTTP API

All endpoints are JSON under `/api/`. The UI is a static SPA served from `/`.

## Catalog
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/catalog` | — | gstack phases in pipeline order, each with its `skills[]` |

## Projects
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/projects` | — | registered projects, most-recently-used first |
| POST | `/api/projects` | `{ path, name? }` | adds a project (400 if the path doesn't exist, 409 if already registered) |
| GET | `/api/projects/:id` | — | project + `runningCount` + `runsCount` (touches `lastUsedAt`) |
| DELETE | `/api/projects/:id` | — | removes the project and its run history (your folder is untouched) |

## Runs
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/projects/:id/runs` | — | run records for the project, newest first |
| POST | `/api/projects/:id/runs` | `{ skillId, args? }` | launches the skill via the Claude Code CLI; returns the run record |
| GET | `/api/runs/:rid` | — | one run record |
| GET | `/api/runs/:rid/stream` | — | **SSE**: `snapshot` (record so far) → `chunk` (text) → `end` (status) |
| POST | `/api/runs/:rid/stop` | — | sends SIGTERM to the running CLI process |

## Settings
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/settings` | — | settings + `permissionModes[]` |
| PUT | `/api/settings` | partial settings | merges and saves |

`settings` = `{ claudeBin, model, permissionMode, commandPrefix, extraArgs }`.

## Health
| GET | `/api/health` | — | `{ ok, home }` |
