# Contributing to Inkstone

Thank you for helping improve Inkstone.

## Before opening a change

- Search existing issues and pull requests to avoid duplicate work.
- Keep changes focused. Separate unrelated refactors from bug fixes or features.
- Preserve Markdown source compatibility, import and backup compatibility, strict HTML sanitization, offline writes, and mobile behavior.
- User-facing text must use an English message ID from both locale resources. Do not use Chinese text or full sentences as translation keys.
- Literal Chinese text in source files is allowed only in `src/shared/locales/zh-CN.ts`. Tests for Chinese behavior must use locale values or Unicode escapes.
- Code comments are reserved for necessary file-level architecture notes and must be written in English.

## Development setup

```bash
npm ci
npm run dev
```

The local application is available at `http://localhost:7712`. Wrangler stores local D1, R2, and Durable Object state under `.wrangler/state/`.

## Local pre-commit gate

`npm install` / `npm ci` automatically points Git at `.githooks/` (`core.hooksPath`, wired by the `prepare` script), so every commit is policy-gated before it can reach CI:

- Always: `size:check` (files ≤ 500 lines, functions ≤ 50 lines, nesting ≤ 3), `comments:check` (code comments must be pre-approved architecture notes), and `escape:check` (no explicit `any` or `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`).
- When the commit stages `.ts`/`.tsx` files: an incremental `tsc -b` and `vitest related <staged files>` (unit tests that import the staged files only — the full suite still runs in CI).

Inspect the active hooks with `git config core.hooksPath`. If a hook blocks a commit you believe is legitimate, do not use `git commit --no-verify` casually — first confirm the change would pass the same checks in CI.

## Required checks

Run the relevant focused tests while developing, then run the complete release gates before opening a pull request. The same gates run in CI and locally on commit:

```bash
npm run typecheck
npm run i18n:check
npm run comments:check
npm run escape:check
npm run module-state:check
npm run size:check
npm run test:unit
npm run build
```

Changes to Worker routes, persistence, synchronization, imports, exports, or backups should also run the isolated end-to-end suite described by `npm run test:e2e`.

## Releases

The root `package.json` is the only version source. The application imports its
`version` field at build time, and deployed instances compare that embedded
version with the official repository's `main` branch `package.json`. Set the
field to a stable SemVer value such as `0.2.0` only when that version is ready
to be announced to existing installations. Do not use a `v` prefix or a
prerelease identifier.

## Pull requests

Describe the user-visible outcome, important compatibility effects, security implications, and the exact checks you ran. Include screenshots for interface changes and explain narrow-screen behavior when layout is affected.

By contributing, you agree that your contribution is licensed under the repository's LGPL-3.0-only license.
