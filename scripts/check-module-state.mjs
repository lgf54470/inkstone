import fs from 'node:fs'
import path from 'node:path'

/**
 * Guards against module-level mutable state.
 *
 * 1. src/worker must hold NO module-level mutable state: Cloudflare Workers
 *    reuse isolates across requests, so a module-scope `let` or a module-scope
 *    Map/Set that is mutated at request time would leak data between users.
 * 2. `useState` at module scope (outside a component) is a React misuse;
 *    state must live inside components or in an explicit store module.
 */
const WORKER_DIR = 'src/worker'
const CLIENT_DIR = 'src/client'

const problems = []

function walk(directory) {
  const out = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) out.push(...walk(target))
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(target)
  }
  return out
}

function relative(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/')
}

// 1. Worker: no module-level mutable bindings.
for (const file of walk(WORKER_DIR)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (/^(export\s+)?(let|var)\s/.test(line)) {
      problems.push(`${relative(file)}:${index + 1}: module-level let/var in worker`)
    } else if (/^(export\s+)?const\s+\w+\s*=\s*(new\s+(Map|Set)\(\)|\[\]|\{\})/.test(line)) {
      // Inline-literal `new Set([...])` tables are immutable lookups; only empty
      // initializers are runtime-fillable and therefore cross-request mutable.
      problems.push(`${relative(file)}:${index + 1}: module-level mutable collection in worker`)
    }
  })
}

// 2. Client: no module-level useState (React hook outside a component).
for (const file of walk(CLIENT_DIR)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (/^(export\s+)?const\s+\w+\s*=\s*useState/.test(line)) {
      problems.push(`${relative(file)}:${index + 1}: module-level useState (hook outside a component)`)
    }
  })
}

if (problems.length > 0) {
  console.error(`module state check failed: ${problems.length} issue(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('module state check passed: no module-level mutable state in worker, no module-level hooks in client')