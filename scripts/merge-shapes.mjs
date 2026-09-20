// The signature-level detector: a merge whose result compiles and still means something else.
//
// The name-level detectors in merge-preflight-analysis.mjs answer "will this build?" — an import of a
// name the other side moved away cannot resolve, so the compile step confirms the finding. This one
// answers the question the compiler cannot: one side re-shaped a declaration (a default, a parameter,
// its order, its return), the other side's new code reads it, and every type still lines up. It is
// the compiler doing the positioning — the declaration node and the exact text of its signature —
// while the pairing logic stays name-level, which is why this module is separate: the analysis module
// is deliberately free of the compiler, and this one exists because that freedom has a ceiling.
//
// The compiler is required on first use rather than imported: loading it costs about half a second
// (measured), which is worth paying only when a name both sides touched actually exists — most merges
// have none — while the caller has already done the cheap pass that tells it so.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let compiler = null

function typescript() {
  if (!compiler) compiler = require('typescript')
  return compiler
}

// Newlines and their indentation only, so a signature written across lines compares equal to the same
// signature on one line while a meaningful space inside a default keeps its meaning.
function normalize(text) {
  return text.replace(/\s*\n\s*/g, ' ').trim()
}

// A declaration's signature is everything before its body: `export function f(a: string, b = 1): X`
// for a function, the same slice for a method, and for a function-valued `const` the parameter list
// and return annotation it carries. Declarations whose body is not code (interfaces, type aliases,
// enums, plain object literals) have no runtime shape to change, and a type-level change is what the
// compile step already refuses.
export function declarationShapes(text, fileName = 'module.ts') {
  const ts = typescript()
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)
  const shapes = new Map()
  const add = (name, shape) => {
    if (name && !shapes.has(name)) shapes.set(name, normalize(shape))
  }
  const before = (node, body) => source.text.slice(node.getStart(source), body.getStart(source))
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      add(statement.name.text, before(statement, statement.body))
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      for (const member of statement.members) {
        if (!member.body) continue
        if (ts.isConstructorDeclaration(member)) add(`${statement.name.text}.constructor`, before(member, member.body))
        else if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) add(`${statement.name.text}.${member.name.text}`, before(member, member.body))
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        const init = declaration.initializer
        const callable = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : null
        if (callable && callable.body) {
          add(declaration.name.text, `${declaration.name.text}${source.text.slice(declaration.name.getEnd(), callable.body.getStart(source))}`)
        }
      }
    }
  }
  return shapes
}

// The declarations one side re-shaped while the other side left them alone. Files are filtered by the
// names they declare — the same regex pass the name-level detectors use — before anything is parsed,
// and the other two revisions of a file are only parsed once one of its names turns out to matter.
// Both matter for the cost: measured on the merge this was written for, filtering by a substring
// instead let almost every touched file through and parsing three versions of each cost 6.8s, while
// the names a file declares cut it to the handful below.
export function reshapedNames({ files, shaper, other, readText, namesOfInterest, declaredNames }) {
  const entries = []
  for (const file of files) {
    if (!/\.(ts|tsx|mts|cts)$/.test(file)) continue
    const text = readText(shaper, file) || ''
    if (![...declaredNames(text)].some((name) => namesOfInterest.has(name))) continue
    const shaped = declarationShapes(text, file)
    let base = null
    let otherSide = null
    for (const [name, shape] of shaped) {
      if (!namesOfInterest.has(name)) continue
      base ??= declarationShapes(readText('base', file) || '', file)
      const before = base.get(name)
      if (before === undefined || before === shape) continue
      otherSide ??= declarationShapes(readText(other, file) || '', file)
      // The reading side has to have left it alone: if it re-shaped or removed the same declaration
      // the conflict list and the compile step both point at that file, and this list is for what
      // neither of them sees.
      if (otherSide.get(name) !== before) continue
      entries.push({ shaper, file, name, base: before, changed: shape })
    }
  }
  return entries
}

// The reader is the side whose new code was written against the old signature, so it is the side the
// finding is reported from: its file, and the file the other side reshaped.
export function shapeCrossings({ reshaped, reads }) {
  const byName = new Map()
  for (const entry of reshaped) {
    if (!byName.has(entry.name)) byName.set(entry.name, [])
    byName.get(entry.name).push(entry)
  }
  const entries = []
  const seen = new Set()
  for (const read of reads) {
    for (const shaped of byName.get(read.name) ?? []) {
      const key = `${read.side}\u0000${read.file}\u0000${read.name}\u0000${shaped.file}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({
        kind: 'reshaped',
        side: read.side,
        file: read.file,
        name: read.name,
        shaper: shaped.shaper,
        shaperFile: shaped.file,
        base: shaped.base,
        changed: shaped.changed,
      })
    }
  }
  return entries.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
}
