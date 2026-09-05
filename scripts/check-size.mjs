import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = 'src'
const BASELINE_PATH = path.join(import.meta.dirname, 'check-size.baseline.json')
const HARD_LINES = 500
const HARD_FN_LINES = 50
const HARD_NESTING = 3

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) out = walk(target, out)
    else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.d.ts')) out.push(target)
  }
  return out
}

function relative(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/')
}

function isFunction(node) {
  return (ts.isFunctionDeclaration(node) && node.body)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessor(node)
    || ts.isSetAccessor(node)
}

function isControl(node) {
  return ts.isIfStatement(node)
    || ts.isForStatement(node)
    || ts.isForInStatement(node)
    || ts.isForOfStatement(node)
    || ts.isWhileStatement(node)
    || ts.isDoStatement(node)
    || ts.isCatchClause(node)
    || ts.isSwitchStatement(node)
    || ts.isTryStatement(node)
}

function measure(text) {
  const sf = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true)
  const long = []
  const deep = []
  function bodyLines(node) {
    return text.slice(node.getStart(), node.getEnd()).split('\n').length
  }
  function walkFunction(node, depth, max) {
    max.value = Math.max(max.value, depth)
    ts.forEachChild(node, (child) => {
      if (isFunction(child)) {
        const childMax = { value: 0 }
        walkFunction(child, 0, childMax)
        const line = sf.getLineAndCharacterOfPosition(child.getStart()).line + 1
        const name = (child.name && child.name.getText(sf)) || '<anonymous>'
        if (child.body && bodyLines(child.body) > HARD_FN_LINES) {
          long.push({ name, line, size: bodyLines(child.body) })
        }
        if (childMax.value > HARD_NESTING) {
          deep.push({ name, line, depth: childMax.value })
        }
        return
      }
      walkFunction(child, depth + (isControl(child) ? 1 : 0), max)
    })
  }
  walkFunction(sf, 0, { value: 0 })
  return { lines: text.split('\n').length, long, deep }
}

function baselineEntryFrom(result) {
  const entry = {}
  if (result.lines > HARD_LINES) entry.lines = result.lines
  if (result.long.length > 0) entry.longFns = result.long.length
  if (result.deep.length > 0) entry.deepFns = result.deep.length
  return entry
}

const files = walk(ROOT).sort()
const measurements = new Map()
for (const file of files) {
  measurements.set(relative(file), measure(fs.readFileSync(file, 'utf8')))
}
const updateBaseline = process.argv.includes('--update-baseline') || !fs.existsSync(BASELINE_PATH)

let baseline
if (updateBaseline) {
  const next = {}
  for (const [rel, result] of measurements) {
    const entry = baselineEntryFrom(result)
    if (Object.keys(entry).length > 0) next[rel] = entry
  }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
  baseline = next
  console.log(`baseline regenerated: ${Object.keys(next).length} files exceed AGENTS.md size limits`)
  if (process.argv.includes('--update-baseline')) process.exit(0)
} else {
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
}

const problems = []
let grandfathered = 0
for (const [rel, result] of measurements) {
  const budget = baseline[rel] ?? {}
  const linesBudget = budget.lines ?? HARD_LINES
  const longBudget = budget.longFns ?? 0
  const deepBudget = budget.deepFns ?? 0
  if (result.lines > linesBudget) {
    problems.push(`${rel}:1: ${result.lines} lines exceeds budget ${linesBudget}`)
  }
  if (result.long.length > longBudget) {
    for (const fn of result.long) {
      problems.push(`${rel}:${fn.line}: function '${fn.name}' is ${fn.size} lines (max ${HARD_FN_LINES})`)
    }
  }
  if (result.deep.length > deepBudget) {
    for (const fn of result.deep) {
      problems.push(`${rel}:${fn.line}: function '${fn.name}' nests control flow ${fn.depth} levels (max ${HARD_NESTING})`)
    }
  }
  if (result.lines > HARD_LINES || result.long.length > 0 || result.deep.length > 0) grandfathered++
}

if (problems.length > 0) {
  console.error(`size check failed: ${problems.length} violations across ${new Set(problems.map((p) => p.split(':')[0])).size} files (${measurements.size} scanned, ${grandfathered} grandfathered)`)
  console.error('run "node scripts/check-size.mjs --update-baseline" only after intentionally fixing code')
  for (const problem of problems) console.error(problem)
  process.exit(1)
}

console.log(`size check passed: ${measurements.size} files scanned, ${grandfathered} grandfathered; fix and resnapshot with --update-baseline`)
