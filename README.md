<p align="center">
  <img src="./public/inkstone-logo.svg" width="112" height="112" alt="Inkstone project logo" />
</p>

<h1 align="center">Inkstone</h1>

<p align="center">
  A self-hosted Markdown notebook for writing, organizing, syncing, and backing up personal knowledge.
</p>

<p align="center">
  <a href="./README_ZH.md">中文</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a> ·
  <a href="./LICENSE">LGPL-3.0-only</a> ·
  <a href="https://inkstone-demo.pages.dev/">Demo</a>
</p>


## About

Inkstone is a browser-based notebook that runs on Cloudflare Workers. Notes always remain plain Markdown text; on top of that foundation, the application provides focused writing, live preview, lexical and optional semantic search, bidirectional links, offline editing, multi-device synchronization, private AI access, public sharing, and off-site backups.

It is a complete self-hosted application. The deployer retains control of the database, attachments, and runtime environment.

Every new account automatically receives two standard starter notes, one in Chinese and one in English. The browser-only demo reuses the same note content; refreshing the page restores these two starter notes instead of loading a separate set of demo data.

## Features

| Area | Included |
| --- | --- |
| Writing | CodeMirror 6 editor, independently editable note titles, **two-note editor groups**, per-group editor/split/preview layouts, synchronized scrolling, outline, **focus mode**, **typewriter mode**, **autosave**, **version history**, and **presentation mode** (decks split on `---`, fullscreen playback, slide list, live follow with a freeze switch, PDF export) |
| Markdown | GFM tables and task lists, footnotes, Obsidian-style comments, WikiLinks, embeds, block IDs, callouts, details blocks, tabs, **math**, **Mermaid diagrams**, **interactive mind maps** (`mindmap`, two-way synced with a full screen editor), **PrismJS syntax highlighting**, and **Front Matter** |
| Organization | Nested folders with drag-and-drop ordering, inline tags, favorites, pinning, archive, trash, **wiki links**, backlinks, block references, note embeds, and a relationship graph |
| Search | D1 FTS5 **full-text search** with Chinese indexing, filters, recent notes, command-palette navigation, and optional private **semantic/hybrid search** powered by Workers AI |
| **MCP** | Private remote MCP, OAuth 2.1 with PKCE, revocable `ink_...` API keys, standard `search`/`fetch`, bounded reads, revision-safe writes, separate trash permission, and per-account grant management |
| Reliability | Installable PWA, offline app launch, browser-side cache, **offline write queue and optimistic concurrency control**, immediate local mutations with rollback, stale-sync protection, conflict copies, realtime notifications, and elected-tab polling fallback |
| Sharing | Public note links with optional access passwords and expiration dates |
| Portability | JSON and ZIP exports, directly readable **Markdown**, attachment export, and **manual or scheduled WebDAV/S3 backups** |
| Interface | **Desktop and mobile layouts**, **dark/light themes**, accent colors, Simplified Chinese, English, and owner-only update notifications |

## Presentation mode

Note bodies split into slides on `---` rules. A block that is too tall is scaled down to fit; content that still does not fit continues on the next slide, and the counter reads `3 / 14` with a `1/2` badge while a slide is split further.

A show follows the note it was started from, so an edit — including one arriving from another tab, another device, or an MCP write — lands on the projector. "Freeze this snapshot" pins the deck to what is on screen for the actual talk.

| Key | Action |
| --- | --- |
| `→` `↓` `PageDown` `Space` | Next slide (`Space` and `Enter` yield to a focused control) |
| `←` `↑` `PageUp` | Previous slide |
| `Home` / `End` | First / last slide |
| `F` | Enter or leave fullscreen |
| `S` | Show or hide the slide list |
| `L` | Switch between following the note and the frozen snapshot |
| `Esc` | Exit the show and return focus to the button that started it |

The list on the left is a page list, not a slide list: every page gets an entry with a thumbnail of that page, and a click jumps straight to it. A `---` slide that paginates shows all of its pages, so a note written without any `---` still gets a full sidebar. The whole deck is measured in the background while the show is idle, so every page is listed from the start — including the slides the show has not reached yet. One slide per idle window is measured, and the pause before the next one follows what the last one cost and how the display is keeping up: a gap that dropped frames doubles the pause (up to four times), and two quiet gaps bring it back down. The list says how far the measuring has got while it is running and stops saying it once every page is there. During a show the controls fade out and come back on the next pointer move or key press.

There are two exports:

- Exporting as PDF runs through the browser's print pipeline. The sheet builds one printable page per page the show has, from the same measured pages, and draws its charts on its own canvases with the slide's own type scale and chart height before the print dialog opens, so "Save as PDF" produces a handout that matches the talk page for page rather than a reflow of it.
- Exporting as images rasterizes those same pages to PNGs (two pixels per design pixel, numbered from `deck-01.png`) and downloads them as one zip. No screenshot library is involved: a page is serialized into an SVG that the browser draws and a canvas encodes, and a chart is swapped for a still of itself first, because a canvas cannot travel inside the serialized markup.

## New note templates

Every new note starts from a configurable template (Settings → New notes). The default template inserts a front matter block:

```markdown
---
title: {{title}}
createdAt: {{createdAt}}
tags: []
aliases:
  - ''
---

```

Placeholders are filled in when the note is created:

| Placeholder | Value |
| --- | --- |
| `{{title}}` | The note title; the localized "New note" label for untitled notes |
| `{{createdAt}}` | Creation time as `yyyy-mm-dd hh:mm:ss` |
| `{{date}}` | Today's date as `yyyy-mm-dd` |
| `{{time}}` | Current time as `hh:mm:ss` |
| `{{today}}` / `{{tomorrow}}` / `{{yesterday}}` | Relative dates as `yyyy-mm-dd` |
| `{{folder}}` | Name of the destination folder (folder views, folder context menus, or a folder-scoped graph) |
| `{{tags}}` | The current tag when creating from a tag view (comma-separated for multiple tags) |
| `{{cursor}}` | Where the caret lands after creation; not written into the note |

Notes:

- Values are quoted automatically when needed, so titles containing `:`, `#`, and similar stay valid YAML.
- Creating from a tag view appends the tags to the front matter `tags` list and exposes them as the `{{tags}}` placeholder context.
- Leaving the template empty starts from a blank note; the settings panel shows a live preview with sample title/folder/tag inputs, a marker where `{{cursor}}` resolves, and hints about where contextual placeholders come from.
- From a tag view, cmd/ctrl+click tags in the sidebar to select several; new notes then carry all of them (front matter tags and the `{{tags}}` placeholder).
- Title ↔ front matter `title` sync can be enabled or disabled independently in Settings → New notes.
- "Insert note template" (toolbar block menu, command palette, or `Ctrl/Cmd+Shift+T`) renders the template into any note at the caret, using the current note's title, folder, and tags as context.
- The MCP `create_note` tool applies the same template when `content` is omitted.

## Graph tag filtering

Sidebar-selected tags join the graph's own tag filter (combined with the graph's tag dropdown). The match mode — any tag (union) or all tags (intersection) — is chosen in the graph settings, and both sources share the 20-tag cap.

The graph settings panel offers these controls:

**Filters**

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| Folder | Select | All folders | Restrict the graph to one folder |
| Tag | Select | All tags | Restrict the graph to one tag |
| Tag match | Select | Any | How the graph's tag and sidebar selections combine: any tag (union) or all tags (intersection) |
| Show orphans | Toggle | On | Show notes that have no links |
| Show unresolved | Toggle | On | Show unresolved wiki-link targets |
| Depth | Select (local mode) | 1 | How many neighbor hops to include in local mode |
| Clear also resets the tag filter | Toggle | On | "Clear selection" also resets the graph's own tag dropdown |
| Clear also closes the panel | Toggle | On | "Clear selection" also closes the graph panel |

**Appearance**

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| Group by | Select | None | Group nodes by folder or tag |
| Show arrows | Toggle | On | Draw link arrows |
| Show labels | Toggle | On | Show node labels |

**Forces**

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| Repulsion | Slider | 900 | Push force between nodes |
| Link distance | Slider | 76 | Preferred link length in px |
| Node size | Slider | 1 | Base node radius scale |

## Data storage

| Component | Purpose |
| --- | --- |
| Cloudflare D1 | Accounts, notes, folders, tags, settings, versions, shares, lexical indexes, per-account AI embeddings, and background indexing queues |
| Cloudflare R2 or Workers KV | Attachment and uploaded-avatar binaries through the `FILES` or `FILES_KV` binding |
| Workers KV `OAUTH_KV` | OAuth client registrations, authorization codes, access and refresh tokens, and grants; note bodies are not stored here |
| Workers AI `AI` binding | Optional embedding generation for semantic search; unavailable deployments continue to use lexical search |
| Browser IndexedDB | Local cache and pending offline writes |
| `SyncHub` Durable Object | Realtime change notifications between active clients |
| `CredentialVault` Durable Object | Isolated storage for the key used to encrypt backup credentials |
| WebDAV or S3 storage | User-configured off-site backups |

## Deployment

1. Fork the Inkstone repository to your GitHub account.
2. Open [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create).
3. Select **Continue with GitHub**, then choose your forked repository.
4. For R2 mode, set the build command to `npm run build` and the deploy command to `npm run deploy`.
   - To use KV mode, change the deploy command to `npm run deploy:kv`.
5. After deployment completes, open the generated Workers URL.

Existing databases are upgraded automatically through versioned, idempotent migrations. Keep a current backup before updating any self-hosted deployment. When a newer stable Inkstone release is available, the owner receives a focused reminder without interrupting regular members.

## Exports and backups

- JSON export preserves legacy structured notebook data for re-import.
- ZIP export and remote backups use the same verified Markdown snapshot format, including readable notes, archived and trashed notes, attachments, and a completion marker.
- Remote backup targets support WebDAV and S3-compatible storage, with duplicate attachment content stored only once inside each snapshot.
- Large backups can be restored by selecting the backup folder, without loading one complete archive into memory.
- Multiple targets can be configured and run manually or on a schedule.
- Login passwords, active sessions, share passwords, and backup-service credentials are not included in exports.

## Development and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Worker and client |
| `npm run dev:kv` | Start locally with the KV attachment configuration |
| `npm run dev:demo` | Start the reset-on-refresh browser-only demo |
| `npm run typecheck` | Run TypeScript project checks |
| `npm run test:unit` | Run the Vitest unit test suite |
| `npm run i18n:check` | Verify parity between the English and Chinese locale resources |
| `npm run comments:check` | Enforce the source-comment policy |
| `npm run build` | Type-check and create a production build |
| `npm run deploy:kv` | Build and deploy with `wrangler.kv.toml` |
| `npm run deploy:demo` | Build and deploy the static browser-only demo |
| `npm run test:e2e` | Exercise the API against a running disposable local instance |
| `node scripts/measure-preflight.mjs` | Measure what the presentation's background deck measurement costs the main thread |
| `node scripts/check-merge-preflight.mjs [branch]` | Report what merging a diverged branch into this one would collide with |

The end-to-end script creates, changes, and deletes data at `http://localhost:7712`. Run it only against a fresh local state dedicated to testing.

The preflight measurement is a manual harness rather than a gate: frame timing on shared CI runners is not a stable signal, so it prints the numbers and a verdict for a human. It signs in with `INKSTONE_VISUAL_USERNAME`/`INKSTONE_VISUAL_PASSWORD` and builds its own long, diagram-heavy deck.

The merge preflight is the other manual harness, and it is about reading a merge before running it. It reports the paths git will conflict on, the files one side deleted while the other changed them, and the test files that exist on only one side. When the runner config is itself in conflict it compares each side's lists against every test in the merge result and names what taking one side alone would leave unrun or hand to the other project — the two ways a suite shrinks or fails that no conflict marker shows. It also reports the crossings between the two sides' edits — a declaration one side moved or reshaped under code the other side was writing — because those are the ones no conflict marker and no `git status` shows; the same judgment runs in both modes from the two revisions alone. It changes nothing: `git merge-tree` computes the merge in memory and writes only tree objects, and every other read is `rev-list`, `diff`, `ls-tree` or `show`. Its crossings are pinned by `tests/merge-preflight-real-merge.test.ts`, which replays the two sides of the merge it was written for and fails if the report shrinks (or grows: a new finding is read and re-pinned deliberately). That test needs both commits, so it skips in a one-commit clone and fails in a complete one that has lost them — a broken pin is not an absent one.

That check also stands in the way of the merge itself, because the same findings are invisible in the conflict list: `.githooks/pre-merge-commit` runs it against the resolution whenever `git merge` is about to create the commit, and `.githooks/pre-commit` runs it for a merge committed by hand after resolving conflicts. A merge is refused while a test file would be left in no project, a test the other side had put in the node project would run under jsdom, a file either side added under `src/`, `tests/`, `scripts/` or `blog-frontend/` is missing from the result, or a conflict marker is still in the staged content. `INKSTONE_ALLOW_MERGE_HAZARDS=1` accepts those findings deliberately — it skips this one check rather than every gate, which is what `--no-verify` would do.

`pre-merge-commit` then also runs `--verify`, which is the part no finding can decide: `tsc -b` over the merge result, plus the tests related to the files a refactor crossing passed through. A crossing is either a declaration one side took out of a file the other side was editing in place, or a name one side moved out of a module that the other side's files still read it from — directly, or through a chain of barrels that keep re-exporting the old path (`export * from` and `export { x } from`, followed module by module) — both reported with the module the name landed in, and both invisible to the conflict list (on the merge these were written for, the silently auto-merged pair was `middleware/security-headers.ts`, still importing `mergeSettings` from `@shared/constants`, and the `constants.ts` whose exports had moved to `@shared/user-settings`). The smoke group is the crossings' own files, so a narrow crossing costs seconds while a module-wide move can pull a few hundred test files: measured on one merge, 3 tests in 19s against 179 files and 1447 tests in 67s. Following the chains costs one batched read per revision — the same merge is inspected in 0.9s — and it is what finds the case no shared file betrays: a consumer two modules away from the change, reported as `imports mergeSettings from src/shared/index.ts (re-exported through src/shared/constants.ts)`. It is there because `git merge` runs `pre-merge-commit` *instead of* `pre-commit` (with no `pre-merge-commit` in place, no hook runs at all), so a merge commit would otherwise be the one commit in the repository that skips both the compile and the tests. `INKSTONE_SKIP_MERGE_VERIFY=1` skips that step deliberately, separately from the findings, so that a tree which cannot be compiled mid-refactor does not push anyone to `--no-verify`. The decisions themselves live in `scripts/merge-preflight-analysis.mjs`, the reads in `scripts/merge-git.mjs`, the crossing assembly in `scripts/merge-crossings.mjs` and the signature pass in `scripts/merge-shapes.mjs`, all of which the tests import directly; the script around them judges nothing and, besides git, only runs the two commands of `--verify`.

That last one answers the question the compile step cannot: one side re-shaped a declaration — a default, a parameter, its order, its return — while the other side's new code reads it, and every type still lines up. The positioning is the compiler's (the declaration node and the text of its signature, body excluded, types left to the compile step); the pairing stays name-level, and only files whose declared names someone reads are parsed. It is reported apart from the crossings and never refuses a merge: what a reader has to do about it is read, not fix a type. Replayed on the merge the tool was written for, it finds four of these where the compile step finds none — a default `locale = 'zh-CN'` removed under two callers, an optional parameter added, a return type replaced — and their files join the smoke group, so the tests around them run even though nothing failed to compile. It costs about a second and a half on a 484-file merge (the compiler is loaded on first use, which is why most merges never load it at all), against the 70s the typecheck after it takes.

### Local dev account

```bash
node scripts/dev-account-setup.mjs                        # registers admin / admin123
node scripts/dev-account-setup.mjs -u test -p test12345   # custom credentials
```

On a fresh local instance the first registered account becomes the owner. If the account already exists, the script verifies the password by logging in; if the instance already has accounts and registration is closed, enable registration in its settings before creating additional ones. Passwords need at least 8 characters. This is a dev tool — never point it at a deployed instance.

## Repository layout

```text
src/
├── client/   React interface, editor, preview, and local state
├── shared/   Shared types, limits, locale resources, and Markdown utilities
└── worker/   Hono API, authentication, D1 access, sync, sharing, and backups
public/       Static assets
scripts/      Repository checks and end-to-end verification scripts
tests/        Cross-module regression tests
```

## Security and contributions

Read [`SECURITY.md`](./SECURITY.md) before reporting a vulnerability. Development setup and contribution requirements are documented in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

Inkstone is distributed under the [GNU Lesser General Public License v3.0 only](./LICENSE), using the SPDX identifier `LGPL-3.0-only`.
