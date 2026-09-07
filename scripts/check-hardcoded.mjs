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
//     text-[11px], tracking-[0.06em], grid-cols-[210px_...]) in className/class
//     attributes and cn() string arguments. The compliant shape is a design
//     token reference ([var(--...)]), the sanctioned style-constant-table
//     pattern (a string inside a named initializer, e.g. a const holding the
//     className, like the hex exemption below), or an existing utility class.
//     Brackets whose content is var()/calc()/min()/max()/clamp()/env() or a
//     color function (oklch()/rgb()/...) are exempt: token references are the
//     goal; calc/min/max/clamp/env are viewport-relative responsive math
//     (safe-area insets, 100vw offsets); color functions carry % channels,
//     not sizes. Numeric exemption matches the style scan: 0/1/100 (e.g.
//     gap-[1px] is a canonical hairline). cn() arguments are scanned
//     recursively so ternary/binary class strings (cond ? 'w-[2px]' : ...)
//     cannot dodge the check.
// Numeric literals in .ts (non-JSX) files are out of scope: without a type
// checker a bare number cannot be told apart from data, and the visual
// surface is JSX by construction.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOTS = ['src', 'blog-frontend/src']
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.wrangler'])

// The & lookbehind keeps HTML entities (&#039;) out of the hex scan.
const HEX_RE = /(?<![0-9a-fA-F&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g
const UNIT_VALUE_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|pt|%)$/
const NUMERIC_ATTR_RE = /^-?\d+(?:\.\d+)?(?:px)?$/
// Unit values inside Tailwind arbitrary-value brackets; also matches .06em.
const ARBITRARY_UNIT_RE = /-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|pt|%)/g
const EXEMPT_NUMBERS = new Set([0, 1, -1, 100])

const VISUAL_ATTRS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'fontSize', 'lineHeight', 'letterSpacing', 'borderRadius', 'borderWidth',
  'zIndex', 'gap', 'top', 'left', 'right', 'bottom', 'padding', 'margin',
  'inset', 'radius', 'blur',
])

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

// Tailwind arbitrary-value brackets hold raw sizes unless they reference a
// token or compose relative units; return the offending unit values.
function arbitraryUnitProblems(text) {
  const found = []
  let start = 0
  while ((start = text.indexOf('[', start)) !== -1) {
    const close = text.indexOf(']', start)
    if (close === -1) break
    const inner = text.slice(start + 1, close)
    if (!/var\(/.test(inner) && !/^(?:calc|min|max|clamp|env)\(/.test(inner.trim())
      && !/^(?:oklch|oklab|rgb|rgba|hsl|hsla|color-mix|color|color:|length:var)/.test(inner.trim())) {
      for (const match of inner.matchAll(ARBITRARY_UNIT_RE)) {
        if (!isExemptNumber(match[0].replace(/[^-\d.]/g, ''))) found.push(match[0])
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

  // Part 3: raw unit values in Tailwind arbitrary-value classNames.
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
  // wrapping the class strings; collect every string literal beneath them.
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

  visitHex(sf)
  if (rel.endsWith('.tsx')) visitNumbers(sf)
  visitClasses(sf)
  return found
}

const problems = []
for (const root of ROOTS) {
  for (const file of walk(path.resolve(root))) {
    const rel = path.relative(process.cwd(), file).replaceAll('\\\\', '/')
    if (isExemptFile(rel)) continue
    if (ALLOWED_CONTENT_FILES.has(rel)) continue
    problems.push(...problemsFor(rel, fs.readFileSync(file, 'utf8')))
  }
}

if (problems.length > 0) {
  console.error(`hardcoded value check failed: ${problems.length} violation(s)`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('hardcoded value check passed: no bare hex colors or magic numbers in JSX styles/visual attrs across src + blog-frontend/src')