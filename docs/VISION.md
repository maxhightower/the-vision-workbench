# The Ideation Workbench — Vision & v1 Spec

> A forge for ideas and the mind that makes them — where the world's raw material and your own vision get woven into something neither could be alone.

This document captures the product vision and the first concrete build (v1) for Workbench's next phase. It builds on the existing MVP (see `README.md`, `docs/DATA_MODEL.md`, `docs/API.md`) and is the reference for where the project is heading.

## 1. Why this exists

Most AI tools hand you the full solution. That's great for finishing a task and terrible for learning — it removes the hunt, the chase, the problem-solving that actually builds understanding and skill. The conviction behind this project: as long as AI only delivers finished answers, the people using it get duller.

Workbench is the deliberate opposite. It uses AI's *accessibility* power — surfacing what's relevant, making the unfamiliar approachable — rather than its *solving* power. The aim is a tool with two harvests: you come away with a developed idea **and** a sharper version of yourself. It develops the idea and the thinker at once.

## 2. Two postures

Every workstream/agent runs under one of two postures, chosen per Idea Space (overridable per interaction later):

- **Solution** — today's behavior. Produce the finished result.
- **Learning** — act as an *accessibility tool, not a problem-solver*. Surface only the most relevant information, propose ONE small next step the user can take themselves, then stop and invite feedback before continuing. Move in small steps, never leaps. Frame gaps as approachable next moves, not deficiencies.

The Learning posture is the soul of the product. The spatial "loom" interface (§4) enforces it structurally — you build one row at a time and can't skip ahead.

## 3. Scope: ideation only

This workbench is for **ideation, not building**. It does not become an IDE or a word processor. The product of ideation is a **folder of documents and supplemental artifacts** — the developed idea plus its supporting material (concept map, kept excerpts, discovery finds, branches explored). That folder is the deliverable, and it is the handoff to a *separate* downstream workbench where building actually happens. Workbench is one bench in a larger workshop; the artifact folder is the interchange format between benches.

The idea-web itself is **zip-downloadable, if wanted** — both machine-readable (so another station can re-import the living context) and human-readable (a markdown index / static view, openable without the app). Embeddings in any export are treated as *regenerable*, not canonical.

## 4. The interface model

The interface is **non-linear**. The linear chat transcript is used sparingly — it survives only as the focused, navigable view of a single opened item, with table-of-contents, collapse, branch-shuffle, and highlight. The working surface is spatial.

### Four regions = four metaphors

The interface is composed of **typed regions** — roles, not fixed positions. The user can size, move, and (later) recompose them, including a concentric "outwards-in" topology. The four roles map onto the project's guiding metaphors:

| Region | Metaphor | Role |
| --- | --- | --- |
| Discovery rail | **Gin** | Pulls raw fiber from what exists in the world — the adjacent-unknown, surfaced as an optional "for-you page." |
| Bottom | **Forge** | The focused work surface — hot and singular, one thing worked hard. Domain-general (markdown) for now. |
| Middle | **Garden** | In-progress fragments, tended and growing — plural, patient, parallel windows. |
| Top / map | **Loom / fabric** | The woven web of nodes — what you know and have made. |

Where a thing *sits* encodes how mature it is: world-fiber enters at the rail, is forged at the bottom, grows in the middle, and is woven into the web up top. The geography is the life cycle of an idea-fragment.

### Semantic zoom

The map has its own zoom: a **content view** (condensed topical points — the domain map, where spacing and vacuums read clearly) and a **material view** (every node, shown properly — for work). The two are spatially coherent: a node lives inside its topical point, so zooming in never teleports things.

### Web as engine vs web as view

The web can be **hidden** entirely (single-color calm, panels hover-revealed) or **sliced** (by tag, or by emergent cluster). Hiding hides the *picture*, not the *machine* — embeddings keep connecting and context keeps assembling underneath. The map panel is a continuum from collapsed-to-nothing to full-screen.

### Aesthetic

Full-screen, calm, single-color background, panels revealed on hover. Dark and light themes. **Reactive motion** — motion is feedback on action, not constant ambient drift.

## 5. The web (data model)

The web is the user's knowledge/idea structure: a graph of nodes.

- **Node:** id, text, provenance (source doc + lines + agent run + timestamp), tags, familiarity, embedding vector, position, links.
- **Familiarity:** `unknown` / `unfamiliar` / `somewhat` / `known`. AI-inferred and user-correctable; a user's correction (`source: user`) is never overwritten by a later AI merge.
- **Scope:** one **global** profile of the user across all projects, with each Idea Space presenting a **relevance-filtered lens** onto it. New concepts discovered in a project write back to the global web.
- **Edges:** explicit (user-drawn, stored) and latent (embedding proximity, computed; shown as spatial nearness and on-focus glow, not as a drawn hairball).
- **Layout:** embedding similarity → spatial position (a projection seeds placement; a force sim prevents pile-ups). Meaning seeds a node's position; once the user engages with a node it becomes sticky, so spatial memory holds.
- **Vacuums:** sparse regions of meaning-space *are* unexplored domains — shown as inviting open territory (a map edge), not a deficiency list. This is the gentle framing of "what you don't know yet."

### The discovery rail (for-you page)

The gin region is a cultivated **for-you page** of the adjacent-unknown — with every social-feed incentive inverted. It optimizes for your project's progress (not time-on-app), you *cultivate* it (keeps and "more like this" feed back), it pushes you *outward* (just past your edge — the desirable-difficulty zone), and it *terminates* (bounded by your vacuums; running dry is success). It surfaces a small finite set tied to current vacuums and then **waits** — no infinite scroll, no autoplay. A clicked item offers "more like this" (a step along the embedding gradient) and can draw a faint line to where it would land on the map.

## 6. Recording (the gin gesture)

"Record" / "keep" is one operation with three triggers — **right-click menu, a toolbar button, and drag-and-drop** — at any granularity (a full window, a passage, a few highlighted lines). All three deposit a **node** on the map.

- **Provenance** is attached automatically on every keep; never asked of the user.
- **One node per keep** by default; the mapper agent may *offer* a split when a keep is obviously multi-topic.
- **Placement:** drag-and-drop drops it somewhere specific (manual, "this belongs here"); right-click/button lets the embedding auto-place it.

## 7. Memory engineering

The spatial interface doubles as the model's **context-construction surface** — one set of gestures serves both the human and the model:

- **Branch** = scope (only the live branch's threads enter context).
- **Collapse / expand** = resolution (collapsed → gist, expanded → verbatim).
- **Table of contents** = the always-present skeleton (cheap global awareness).
- **Map / kept nodes** = long-term memory (distilled, durable), versus the transient floor.

The readability/size axis and the context-resolution axis are the same dial: what's expanded for your eyes is expanded for the model. Context assembly is automatic (it is plumbing) and ideally *visible* — in-context regions light up — while the judgment of what's worth keeping (the gin into the map) stays deliberate.

## 8. Agents

- **On-demand, not background.** You act, an agent runs. Continuous background cultivation is a later luxury.
- The **mapper** is the v1 agent: it fires on every keep — embeds the fragment, places it by its neighbors, and optionally suggests a name or a split.
- Per-call **context** = what's currently expanded + a similarity pull from the web (lightweight retrieval).
- Later roles: a scout (discovery rail), a learning-pacer (Learning posture), a cartographer (re-clustering / vacuum detection).

## 9. Architecture & stack

**Local-first, like VSCode + its AI extensions.** A local app, data in plain files (as today — see `docs/DATA_MODEL.md`), AI work done by calling cloud APIs with the user's own key, plus optional local models. No multi-tenant cloud server stores user data.

- **Backend: unchanged.** The existing Node server, file store, and providers are reused. This phase is a *frontend* rebuild behind the same API.
- **Embeddings:** local via Ollama (`nomic-embed-text` or similar) first → cloud embedding API fallback → offline (no auto-connections; manual links only). Vectors stored in files; similarity is **in-memory cosine** — no vector database at personal scale (hundreds to low-thousands of nodes). One embedding model per web; switching models means re-embedding.
- **Frontend stack:** Vite + React + TypeScript; **React Flow (`@xyflow/react`)** for the map; d3-force / elkjs for layout; **Framer Motion** for (reactive) transitions; dnd-kit for cross-region drag; Zustand for state. (Svelte + Svelte Flow was the leaner alternative considered.)
- **Themes:** dark + light.
- **Desktop:** browser-served at localhost for now; **Tauri** is the path to a packaged desktop app later. Same frontend either way.

## 10. v1 slice

The smallest version that proves the feel:

- The existing **seed → understanding** loop.
- A **forge** panel (bottom) to read and work in — domain-general markdown.
- The **map** (top) — two regions only to start (forge + map; garden and discovery rail come later).
- **Keep-to-map**: the three-trigger recording gesture, any granularity, provenance attached.
- One **mapper agent**, firing on every keep (embed, place, optionally name/split).

If that feels alive, the rest is worth building.

## 11. Longer-term

- The **garden** and **discovery rail** regions; composable / concentric layouts.
- **Domain-specific forges** are *not* shapes of this forge — they are *separate downstream workbenches*. This bench stays domain-general; the artifact folder is the handoff.
- Semantic-zoom content view, vacuum rendering, the cultivated for-you page.
- A **Tauri** desktop app; an optional hosted/PWA "webapp" that reads the same folders.

## 12. Open questions

- **Content-view condensation:** by emergent cluster, by tag, or switchable between the two.
- **Discovery reach:** how far past the user's edge the rail reaches, and whether it reads the whole web or only the current focus.
- **Hide/slice → memory:** the current lean is "hide = pure view, slice = optional context scope," not yet locked.
- **Web ↔ artifact:** the web and the deliverable folder are separate but cross-linked by provenance; the exact cross-link UX is still open.
