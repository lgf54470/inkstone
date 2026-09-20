// AGENTS.md rule 2: colors/sizes/spacing/radii/z-index must come from design
// tokens or named constants, never inline literals. This walks the UI source
// trees (src + blog-frontend/src) with the TS AST so prose in comments never
// counts, and flags two shapes:
//   - hex colors (#rgb/#rrggbb/#rrggbbaa) in string/template literals, except
//     inside a named initializer (const/parameter/property/enum member — the
//     sanctioned "style constant table" pattern), test fixtures, demo seed
//     data, and the allowlisted self-contained stylesheets below;
//   - magic numbers in JSX style objects (numeric literals and px/em/rem/pt
//     strings, including inside template expressions) and on visual JSX
//     attributes (width/height/zIndex/gap/...). 0/1/100 are canonical CSS
//     values, not magic; the `size` prop is deliberately not scanned because
//     icon sizes are an established per-site convention across hundreds of
//     call sites, and SVG geometry (r/cx/cy), stroke and opacity attributes
//     are excluded because hand-authored illustration coordinates are
//     one-shot specs the remediation commits never hoisted;
//   - raw unit values inside Tailwind arbitrary-value classNames (w-[240px],
//     text-[11px], grid-cols-[210px_...]) in className/class attributes and
//     cn() string arguments, plus raw values of the design-token families in
//     ANY string literal (Part 4). The compliant shape is a design token
//     reference ([var(--...)] or the w-(--spacing-4) paren shorthand), the
//     sanctioned style-constant-table pattern (a string inside a named
//     initializer, e.g. a const holding the className, like the hex exemption
//     below), or an existing utility class. Brackets and parens whose content
//     is var()/calc()/min()/max()/clamp()/env() or a color function
//     (oklch()/rgb()/...) are exempt: token references are the goal;
//     calc/min/max/clamp/env are viewport-relative responsive math (safe-area
//     insets, 100vw offsets); color functions carry % channels, not sizes.
//     Paren groups that are bare custom-property references (--name, with an
//     optional length:/color: type hint or /50 opacity modifier) are the
//     named-group token form and stay exempt; arbitrary properties
//     ([width:240px], [--scroll-offset:56px]) scan like any other bracket.
//     Numeric exemption matches the style scan: 0/1/100 (e.g. gap-[1px] is a
//     canonical hairline). cn() arguments are scanned recursively so
//     ternary/binary class strings (cond ? 'w-[2px]' : ...) cannot dodge the
//     check, and object-literal keys inside cn() (the clsx conditional-object
//     shape cn({ 'w-[2px]': cond })) are class strings too: hoist the class
//     to a const and write cn(cond && WIDE) instead.
//     Part 4 is the token-family rule: letter-spacing (tracking-), font size
//     (text-) and spacing (w-/h-/min-w-/gap-/p-*/m-*/...) each have a
//     dedicated --tracking-*/--text-*/--sp-* token family, so raw
//     absolute-unit values (px/rem/em/pt) for these families stay a rule-2
//     violation even inside a named constant table — unlike one-off class
//     strings (grid-cols-, blur-, aspect-...) that the table pattern
//     sanctions. Relative percentages (w-[86%], max-h-[36%]) are responsive
//     sizing, not raw sizes, and stay allowed.
//     Runtime-escape rule (companion to Part 4): a decimal token name like
//     --text-11.5 referenced from a JS class string must double the
//     backslash in source (\\.), because JS cooks a lone \. to a plain dot
//     and the runtime class then never matches the compiled selector. Direct
//     JSX attribute values (className="...") keep the backslash verbatim and
//     are correct with a single one, so they are not flagged.
// Part 5 is the palette rule: bg-/text-/border-... followed by a Tailwind
//     color name or white/black draws one fixed hue in both themes instead of a
//     token, so it is banned even inside a named constant table (hoisting a hue
//     does not theme it). Existing call sites are grandfathered per file in
//     check-hardcoded.palette-baseline.json the way check-size.mjs grandfathers
//     oversized files: a file's count may only go down, and going down still
//     needs an explicit --update-baseline so the baseline stays the truth about
//     the tree.
// Numeric literals in .ts (non-JSX) files are out of scope: without a type
// checker a bare number cannot be told apart from data, and the visual
// surface is JSX by construction.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOTS = ['src', 'blog-frontend/src']
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.wrangler'])

// The & lookbehind keeps HTML entities (&#039;) out of the hex scan.
const HEX_RE = /(?<![0-9a-fA-F&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g
const UNIT_VALUE_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|pt|%)$/
const NUMERIC_ATTR_RE = /^-?\d+(?:\.\d+)?(?:px)?$/
// Unit values inside Tailwind arbitrary-value brackets and parens; also matches .06em.
const ARBITRARY_UNIT_RE = /-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|pt|%)/g
const EXEMPT_NUMBERS = new Set([0, 1, -1, 100])

const VISUAL_ATTRS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'fontSize', 'lineHeight', 'letterSpacing', 'borderRadius', 'borderWidth',
  'zIndex', 'gap', 'top', 'left', 'right', 'bottom', 'padding', 'margin',
  'inset', 'radius', 'blur',
])

const PALETTE_COLORS = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const PALETTE_CLASS_RE = new RegExp(`\\b(?:bg|text|border|fill|ring|shadow|outline|decoration|divide|from|via|to)-(?:white|black|(?:${PALETTE_COLORS})-\\d{2,3}(?:/\\d{1,3})?)`, 'g')
const PALETTE_MESSAGE = 'raw Tailwind palette class'
const PALETTE_BASELINE_PATH = path.join(import.meta.dirname, 'check-hardcoded.palette-baseline.json')
// Modules that already draw every colour from tokens keep a zero budget: they
// never enter the baseline, so resnapshotting cannot absorb new debt there.
const PALETTE_ZERO_TOLERANCE_PREFIXES = ['src/client/features/share/']

// Files whose hex literals are authored content or a self-contained
// stylesheet, not UI values that could consume the token layer. Each entry
// carries the reason; add a new file here only when the same argument holds.
const ALLOWED_CONTENT_FILES = new Map([
  ['src/worker/routes/mcp-authorize.ts', 'self-contained OAuth consent page: its embedded <style> block is a standalone stylesheet (same category as the export CSS) that cannot consume the app token layer'],
])

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) out = walk(target, out)
    else if (/\.[jt]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(target)
  }
  return out
}

function isExemptFile(rel) {
  return /\.test\.[jt]sx?$/.test(rel) || rel.startsWith('src/client/demo/')
}

function inNamedInitializer(node) {
  let current = node.parent
  while (current) {
    // A string inside a function body is code (JSX/classNames/computed
    // values), not table data: const C = () => 'w-[240px]' is a loophole,
    // only direct const/param/property/enum data counts as a constant table.
    if (ts.isFunctionLike(current)) return false
    const initializer = ts.isVariableDeclaration(current) || ts.isParameter(current)
      || ts.isPropertyDeclaration(current) || ts.isEnumMember(current)
      ? current.initializer
      : undefined
    if (initializer) {
      return node.getStart() >= initializer.getStart() && node.getEnd() <= initializer.getEnd()
    }
    current = current.parent
  }
  return false
}

function isExemptNumber(value) {
  return EXEMPT_NUMBERS.has(Number(value))
}

// A Tailwind arbitrary-value group is exempt when its content is a token
// reference (var(...) or the w-(--spacing-4) bare-variable shorthand) or
// relative-unit math, never a raw size.
function isExemptArbitraryGroup(inner) {
  const content = inner.trim()
  if (/var\(/.test(inner)) return true
  if (/^(?:calc|min|max|clamp|env)\(/.test(content)) return true
  if (/^(?:oklch|oklab|rgb|rgba|hsl|hsla|color-mix|color|color:|length:var)/.test(content)) return true
  // Paren named-group shorthand: w-(--spacing-4), bg-(--brand/50),
  // text-(length:--my-var) is a CSS-variable reference, not a raw value.
  return /^(?:[a-z-]+:)?--[\w-]+(?:\/[\d.]+%?)?$/.test(content)
}

// Absolute units only (no %): percentages are relative sizing, not raw sizes.
const ABSOLUTE_UNIT_RE = /-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|pt)/g

// Class prefixes whose values belong to a design-token family (letter-spacing
// --tracking-*, font-size --text-*, spacing --sp-*); raw absolute-unit values
// inside their arbitrary brackets/parens are banned even in named constants.
const TOKEN_FAMILY_CLASS_RE = /(?<![a-z-])((?:tracking|text|min-w|max-w|min-h|max-h|space-x|space-y|inset-x|inset-y|size|gap|inset|top|right|bottom|left|p[trblxy]?|m[trblxy]?|w|h)-)([\[(])([^\]\)]*)([\]\)])/g

// A decimal token name (--text-11.5, --sp-0.625) referenced from a class
// string must carry an escaped dot (\\. in source, so the runtime string
// keeps a backslash-dot): a lone backslash-dot is a valid-but-no-op JS
// escape, so TS cooks it to a plain dot and the runtime class never matches
// the selector Tailwind compiled for the escaped candidate. Because TS
// reports cooked text, a plain dot inside the var() name here is exactly the
// broken single-backslash source; the correct form shows up as \\. (dot
// preceded by a backslash) and does not match. Also holds for inline var()
// styles, where the same drop invalidates the declaration.
const PLAIN_DOT_DECIMAL_TOKEN_RE = /var\(--[a-zA-Z0-9_-]*\.\d/

// Tailwind arbitrary-value brackets and parens hold raw sizes unless they
// reference a token or compose relative units; return the offending values.
function arbitraryUnitProblems(text) {
  const found = []
  const seen = new Set()
  const bracketRanges = []
  let start = 0
  while ((start = text.indexOf('[', start)) !== -1) {
    const close = text.indexOf(']', start)
    if (close === -1) break
    bracketRanges.push([start, close])
    const inner = text.slice(start + 1, close)
    if (!isExemptArbitraryGroup(inner)) {
      for (const match of inner.matchAll(ARBITRARY_UNIT_RE)) {
        const value = match[0]
        if (!isExemptNumber(value.replace(/[^-\d.]/g, '')) && !seen.has(value)) {
          seen.add(value)
          found.push(value)
        }
      }
    }
    start = close + 1
  }
  start = 0
  while ((start = text.indexOf('(', start)) !== -1) {
    const close = text.indexOf(')', start)
    if (close === -1) break
    // Paren groups are the named-group shorthand (w-(--spacing-4)); scan them
    // so w-(240px) cannot slip past. Parens nested inside brackets are
    // covered by the bracket scan and skipped here.
    const insideBracket = bracketRanges.some(([a, b]) => start > a && close < b)
    const inner = text.slice(start + 1, close)
    if (!insideBracket && !isExemptArbitraryGroup(inner)) {
      for (const match of inner.matchAll(ARBITRARY_UNIT_RE)) {
        const value = match[0]
        if (!isExemptNumber(value.replace(/[^-\d.]/g, '')) && !seen.has(value)) {
          seen.add(value)
          found.push(value)
        }
      }
    }
    start = close + 1
  }
  return found
}

function problemsFor(rel, text) {
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind)
  const found = []
  const seen = new Set()
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
  const push = (line, message) => {
    const key = `${rel}:${line}:${message}`
    if (seen.has(key)) return
    seen.add(key)
    found.push(`${rel}:${line}: ${message}`)
  }

  // Part 1: hex colors anywhere in a string/template literal.
  function visitHex(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (!node.text) return
      if (inNamedInitializer(node)) return
      for (const match of node.text.matchAll(HEX_RE)) {
        push(lineOf(node), `hardcoded hex color ${match[0]} (AGENTS.md rule 2): hoist to a palette/token module or a named constant`)
      }
    }
    ts.forEachChild(node, visitHex)
  }

  // Part 2: magic numbers in JSX style objects and visual attributes.
  function walkValue(node, report, inStyle) {
    if (ts.isNumericLiteral(node)) {
      if (!isExemptNumber(node.text)) report(lineOf(node), node.text)
      return
    }
    if (ts.isStringLiteral(node)) {
      if (inStyle && UNIT_VALUE_RE.test(node.text) && !isExemptNumber(node.text.replace(/[^-\d.]/g, ''))) {
        report(lineOf(node), node.text)
      }
      return
    }
    ts.forEachChild(node, (child) => walkValue(child, report, inStyle))
  }

  function visitNumbers(node) {
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf)
      const initializer = node.initializer
      if (initializer && name === 'style') {
        walkValue(initializer, (line, value) => {
          push(line, `magic number ${value} in style value (AGENTS.md rule 2): hoist to a named constant`)
        }, true)
      } else if (initializer && VISUAL_ATTRS.has(name)) {
        if (ts.isStringLiteral(initializer) && NUMERIC_ATTR_RE.test(initializer.text) && !isExemptNumber(initializer.text.replace(/[^-\d.]/g, ''))) {
          push(lineOf(initializer), `magic number ${initializer.text} for visual JSX attribute '${name}' (AGENTS.md rule 2): hoist to a named constant`)
        } else {
          walkValue(initializer, (line, value) => {
            push(line, `magic number ${value} for visual JSX attribute '${name}' (AGENTS.md rule 2): hoist to a named constant`)
          }, false)
        }
      }
    }
    ts.forEachChild(node, visitNumbers)
  }

  // Part 3: raw unit values in Tailwind arbitrary-value classNames (brackets,
  // named-group parens, arbitrary properties) in className/class and cn().
  // Part 4: raw absolute-unit values of the token families anywhere, including
  // named constants: letter-spacing/font-size/spacing each have a dedicated
  // --tracking-*/--text-*/--sp-* token layer, so tracking-[0.06em] must become
  // tracking-[var(--tracking-label)] even as a hoisted class string, and
  // w-[2.5px] must become a --sp-* reference or a spacing utility.
  function visitTokenFamilies(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const match of node.text.matchAll(TOKEN_FAMILY_CLASS_RE)) {
        if (isExemptArbitraryGroup(match[3])) continue
        const unit = [...match[3].matchAll(ABSOLUTE_UNIT_RE)]
          .map((u) => u[0])
          .find((u) => !isExemptNumber(u.replace(/[^-0-9.]/g, '')))
        if (!unit) continue
        const prefix = match[1]
        const label = prefix.startsWith('tracking-') ? 'letter-spacing'
          : prefix.startsWith('text-') ? 'font-size' : 'spacing'
        const hint = prefix.startsWith('tracking-') ? 'tracking values must reference a --tracking-* design token'
          : prefix.startsWith('text-') ? 'font sizes must reference a --text-* design token'
          : 'sizes must reference a --sp-* design token or a spacing utility'
        push(lineOf(node), `raw ${label} in ${match[0]} (AGENTS.md rule 2): ${hint}`)
      }
      // Runtime-escape correctness: a decimal token name written with a lone
      // backslash (var(--text-11\.5) in source) is cooked to a plain dot, so
      // the size silently never applies. The source must double the escape.
      const plainDot = node.text.match(PLAIN_DOT_DECIMAL_TOKEN_RE)
      if (plainDot) {
        push(lineOf(node), `unescaped-dot decimal token reference ${plainDot[0]} (AGENTS.md rule 2): JS cooks a lone backslash-dot to a plain dot, so the runtime class never matches — double the backslash in the source`)
      }
      return
    }
    ts.forEachChild(node, visitTokenFamilies)
  }

  function scanClassString(node, report) {
    if (inNamedInitializer(node)) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      for (const value of arbitraryUnitProblems(node.text)) report(lineOf(node), value)
      return
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head, ...node.templateSpans.map((span) => span.literal)]
      for (const part of parts) {
        for (const value of arbitraryUnitProblems(part.text)) report(lineOf(part), value)
      }
    }
  }

  // cn() arguments and className expressions can be ternaries/logicals
  // wrapping the class strings; collect every string literal beneath them —
  // including object-literal keys, which clsx treats as classes by definition.
  function collectClassStrings(node, out) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      out.push(node)
      return
    }
    ts.forEachChild(node, (child) => collectClassStrings(child, out))
  }

  function visitClasses(node) {
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf)
      if ((name === 'className' || name === 'class') && node.initializer) {
        let initializer = node.initializer
        if (ts.isJsxExpression(initializer) && initializer.expression) initializer = initializer.expression
        const strings = []
        collectClassStrings(initializer, strings)
        for (const literal of strings) {
          scanClassString(literal, (line, value) => {
            push(line, `raw ${value} in Tailwind arbitrary-value class (AGENTS.md rule 2): reference a design token (var(--...)) or hoist the class string to a named constant`)
          })
        }
      }
    } else if (ts.isCallExpression(node) && node.expression.getText(sf) === 'cn') {
      const strings = []
      for (const arg of node.arguments) collectClassStrings(arg, strings)
      for (const literal of strings) {
        scanClassString(literal, (line, value) => {
          push(line, `raw ${value} in Tailwind arbitrary-value class (AGENTS.md rule 2): reference a design token (var(--...)) or hoist the class string to a named constant`)
        })
      }
    }
    ts.forEachChild(node, visitClasses)
  }

  // Part 5: a Tailwind palette color class keeps one hue in both themes, so it
  // must become a token reference. Unlike the arbitrary-value rules this has no
  // named-constant exemption: hoisting `text-amber-500` names the hue, it does
  // not theme it. Every string is read, so a hue returned from a plain helper
  // counts the same as one written inline in JSX.
  function visitPalette(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const match of node.text.matchAll(PALETTE_CLASS_RE)) {
        push(lineOf(node), `${PALETTE_MESSAGE} ${match[0]} (AGENTS.md rule 2): draw a design token instead of a fixed palette hue`)
      }
      return
    }
    ts.forEachChild(node, visitPalette)
  }

  visitHex(sf)
  if (rel.endsWith('.tsx')) visitNumbers(sf)
  visitClasses(sf)
  visitTokenFamilies(sf)
  visitPalette(sf)
  return found
}

// Grandfathered palette debt, compared per file: a count may not grow, and a
// count that shrank still has to be resnapshotted so the baseline keeps
// describing the tree instead of the day it was written.
function paletteDriftProblems(current, baseline, prefixes = []) {
  const found = []
  const isZeroTolerance = (rel) => prefixes.some((prefix) => rel.startsWith(prefix))
  for (const [rel, count] of Object.entries(current)) {
    if (isZeroTolerance(rel)) {
      found.push(`${rel}: ${count} ${PALETTE_MESSAGE}(es) in a module that keeps every colour on design tokens (AGENTS.md rule 2): this module has no grandfathered budget`)
      continue
    }
    const budget = baseline[rel] ?? 0
    if (count > budget) {
      found.push(`${rel}: ${count - budget} new ${PALETTE_MESSAGE}(es) (AGENTS.md rule 2): ${budget} grandfathered, ${count} now — draw a design token instead`)
    } else if (count < budget) {
      found.push(`${rel}: palette baseline is stale (${budget} grandfathered, ${count} now) — resnapshot with "node scripts/check-hardcoded.mjs --update-baseline"`)
    }
  }
  for (const [rel, budget] of Object.entries(baseline)) {
    if (rel in current || isZeroTolerance(rel)) continue
    found.push(`${rel}: palette baseline is stale (${budget} grandfathered, 0 now) — resnapshot with "node scripts/check-hardcoded.mjs --update-baseline"`)
  }
  return found
}

// Importable by unit tests; the tree scan only runs when invoked as a CLI.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const problems = []
  const paletteCounts = new Map()
  for (const root of ROOTS) {
    for (const file of walk(path.resolve(root))) {
      const rel = path.relative(process.cwd(), file).replaceAll('\\\\', '/')
      if (isExemptFile(rel)) continue
      if (ALLOWED_CONTENT_FILES.has(rel)) continue
      for (const problem of problemsFor(rel, fs.readFileSync(file, 'utf8'))) {
        if (problem.includes(` ${PALETTE_MESSAGE} `)) paletteCounts.set(rel, (paletteCounts.get(rel) ?? 0) + 1)
        else problems.push(problem)
      }
    }
  }

  const currentPalette = Object.fromEntries([...paletteCounts.entries()].sort())
  const updateBaseline = process.argv.includes('--update-baseline')
  if (updateBaseline || !fs.existsSync(PALETTE_BASELINE_PATH)) {
    const next = Object.fromEntries(Object.entries(currentPalette)
      .filter(([rel]) => !PALETTE_ZERO_TOLERANCE_PREFIXES.some((prefix) => rel.startsWith(prefix))))
    fs.writeFileSync(PALETTE_BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`palette baseline regenerated: ${Object.keys(next).length} files carry raw palette classes`)
    if (updateBaseline) process.exit(0)
  }
  const baseline = JSON.parse(fs.readFileSync(PALETTE_BASELINE_PATH, 'utf8'))
  problems.push(...paletteDriftProblems(currentPalette, baseline, PALETTE_ZERO_TOLERANCE_PREFIXES))

  if (problems.length > 0) {
    console.error(`hardcoded value check failed: ${problems.length} violation(s)`)
    for (const problem of problems) console.error(`  ${problem}`)
    process.exit(1)
  }
  const debt = Object.values(baseline).reduce((total, count) => total + count, 0)
  console.log(`hardcoded value check passed: no bare hex colors or magic numbers in JSX styles/visual attrs across src + blog-frontend/src (${debt} palette classes grandfathered in ${Object.keys(baseline).length} files)`)
}

export { arbitraryUnitProblems, paletteDriftProblems, problemsFor }