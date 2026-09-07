# ADR 0001: Token-Family Gates and the Token-Drift Baseline

Status: Accepted

Date: 2026-09-08

## Context

AGENTS.md rule 2 requires all visual values (colors, sizes, spacing, radii,
z-index) to come from design tokens or named constants, never inline literals.
`scripts/check-hardcoded.mjs` enforces this across the two UI trees
(`src` and `blog-frontend/src`) with a TypeScript AST walk; it cannot parse
`.astro` files, which remain a known blind spot (see Consequences).

Early versions of the gate treated every class string the same way: raw
arbitrary values (`w-[240px]`) were banned inline (Part 3) but allowed inside a
named initializer — the sanctioned "style constant table" (`const WIDE =
'w-[240px]'`). The tracking family broke that symmetry first
(`tracking-[0.06em]` stayed banned even as a hoisted constant), and this ADR
records the generalization of that rule plus the companion token-drift guard.

## Decision

### Part 3: arbitrary-value scan of class strings

Part 3 scans `className`/`class` attributes and `cn()` arguments (recursively,
so ternary/logical/object-literal keys cannot dodge the check) for raw unit
values inside Tailwind arbitrary-value brackets, named-group parens, and
arbitrary properties (`[width:240px]`). Exemptions:

- token references — `var(...)` or the bare `w-(--spacing-4)` paren shorthand;
- relative-unit math — `calc()`, `min()`, `max()`, `clamp()`, `env()`;
- color functions — `oklch()`, `rgb()`, `color-mix()`, ... (they carry %
  channels, not sizes);
- canonical numbers 0/1/100 (`gap-[1px]` is the hairline);
- one-off class strings inside a named initializer (the constant table),
  provided the string is direct const/param/property/enum data — an arrow
  function inside the initializer (`const C = () => 'w-[240px]'`) is a loophole
  and is flagged.

### Part 4: token-family scan of every string literal

Letter-spacing, font size, and spacing each have a dedicated token family
(`--tracking-*`, `--text-*`, `--sp-*`). For those families, a raw absolute-unit
value (px/rem/em/pt) in any of the family's class prefixes is a rule-2
violation in **every** string literal — including named constant tables:

| Family          | Class prefixes                                         | Compliant forms                                          |
| --------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| letter-spacing  | `tracking-`                                            | `tracking-[var(--tracking-label)]`                       |
| font size       | `text-`                                                | `text-[length:var(--text-13)]`, `text-(--text-13)`       |
| spacing         | `w- h- min-w- max-w- min-h- max-h- size- gap- inset- inset-x- inset-y- top- right- bottom- left- p[trblxy]- m[trblxy]- space-x- space-y-` | `w-[var(--sp-0\\.625)]`, `w-(--sp-0.625)`, or a standard utility (`w-60`) |

Two toolchain quirks shape the compliant forms for decimal token names like
`--sp-0.625` and `--text-11.5`: a bare dot inside an arbitrary value breaks
Tailwind candidate extraction (the old `w-[2.5px]` silently never compiled),
and a single backslash-dot written as `\.` inside a JS string literal is
dropped by the language spec, so the runtime class never matches the compiled
selector. In the main app the source must spell the escape as `\\` — `const
ACTIVE_BAR_W = 'w-[var(--sp-0\\.625)]'` — a valid JS escape that survives
every transform and yields the backslash-carrying class Tailwind compiled
(verified live at 2.5px). The remediation of `ACTIVE_BAR_W` also fixed a
latent rendering bug: the old `w-[2.5px]` class was never emitted, so the
outline active bar was invisible. The blog-frontend toolchain differs: its
Tailwind pass compiles only the single-backslash spelling while the runtime
still drops the escape, so dotted refs there render at the fallback size — a
blog-side gap to close separately. Sites across the main-app tree still using
the single-backslash form are likewise broken and need the same `\\`
conversion; both are follow-ups.

The asymmetry is deliberate: the constant-table exemption survives only for
one-off families that have no token layer (`grid-cols-[140px_1fr_28px]`,
`blur-[120px]`). Relative percentages (`w-[86%]`, `max-h-[36%]`) are
responsive sizing, not raw sizes, and stay allowed. The same exemptions as
Part 3 apply (token references, math, color functions, 0/1/100).

Rationale: a hoisted constant is still a hand-picked size; the gate exists so
sizes are picked once in the token table, not scattered as literals that the
table pattern merely renames. Font sizes and spacing map one-to-one onto the
`--text-*`/`--sp-*` tables; letter-spacing onto `--tracking-*`.

### Token-drift baseline (`scripts/check-token-drift.mjs`)

The two `tokens.css` files share one design-token contract. The baseline file
(`scripts/check-token-drift.baseline.json`) snapshots the current shared set —
the intersection of token names present in both files — together with each
token's value on each side. Semantics:

- a baseline token that vanishes from either tree fails;
- a value that deviates from the snapshotted pair on either side fails —
  including an identical retune of both files: changing the shared layer is a
  deliberate act requiring `--update-baseline`;
- a token newly shared by both trees but absent from the snapshot fails
  (staleness); app-private tokens never affect the snapshot and may diverge;
- values compare after `var()` resolution (a literal vs `var(--alias)` compare
  equal) and color-syntax canonicalization (lowercase, hex shorthand expansion,
  percent-vs-number channels, omitted ` / 1` alpha), so cosmetic edits never
  count as drift while real value changes always do.

The guard runs in pre-commit and CI, so a resnapshot is always reviewable as a
baseline diff.

## Consequences

- Inline violations of token-family classes are reported twice (Part 3's raw
  value message plus Part 4's family message); this is accepted noise — the
  line is a violation either way, and the family message names the fix.
- `.astro` files in `blog-frontend` are not scanned; their raw `text-[10px]`
  values are a known gap. Extending the walker to Astro's hybrid
  frontmatter/HTML is a separate change.
- The baseline stores *spellings*, so `--accent`'s `var()`-reference vs
  literal form is now a recorded contract — aligning the spellings requires a
  resnapshot. Color normalization means case/percent/alpha respellings no
  longer do.
- New token families require the same treatment as `--tracking-*`/`--text-*`/
  `--sp-*`: add the family's prefixes to `TOKEN_FAMILY_CLASS_RE` and document
  the family here.
