// The analysis behind check-merge-preflight.mjs, kept apart from the git calls so the pieces that
// decide can be read, and tested, without a repository: what a merge's conflict list means, which
// test file each project would run, and the two hazards that show in no conflict marker.
//
// The parser entry points take the raw output of a git command rather than running one, and the
// detectors take the three versions of a file (base, each side) as a lookup, so every function here
// is pure. The command line, the git reads and the hooks' exit codes stay in the sibling module.

import path from 'node:path'

// The shapes both modules work from: which files are tests, which are TypeScript, where the runner
// config lives, what a conflict marker looks like, and the two ways to accept a hazard. Shared
// rather than duplicated, so a change to any of them cannot apply to half the tool.
export const TEST_FILE_RE = /\.test\.tsx?$/
const TS_FILE_RE = /\.(ts|tsx|mts|cts)$/
export const CONFIG_PATH = 'vitest.config.ts'
export const CONFLICT_MARKER = '<<<<<<<'
export const START_MARKER_RE = '^<<<<<<< '
export const OVERRIDE_ENV = 'INKSTONE_ALLOW_MERGE_HAZARDS'
export const SKIP_VERIFY_ENV = 'INKSTONE_SKIP_MERGE_VERIFY'
// A merge that drops a file one side added has thrown away somebody's work, but only the code
// and test trees are worth refusing the commit over: `.qoder/`-style bookkeeping is per branch by
// nature, so a drop there is reported and not enforced.
export const ENFORCED_PREFIXES = ['src/', 'tests/', 'scripts/', 'blog-frontend/']

// Every branch name, path and tree id below arrives as the raw output of a git command, so the
// parsing helpers stay pure and take that text instead of reaching for git themselves.
export function parseMergeTreeOutput(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  return { tree: lines[0] ?? null, conflicts: lines.slice(1) }
}

export function classifyChanges(nameStatusText) {
  const changes = { added: [], modified: [], deleted: [], renamed: [] }
  for (const line of nameStatusText.split('\n')) {
    if (!line.trim()) continue
    const [status, ...paths] = line.split('\t')
    if (status.startsWith('A')) changes.added.push(paths[0])
    else if (status.startsWith('D')) changes.deleted.push(paths[0])
    else if (status.startsWith('R')) changes.renamed.push({ from: paths[0], to: paths[1] ?? paths[0] })
    else if (status.startsWith('M') || status.startsWith('T')) changes.modified.push(paths[0])
  }
  return changes
}

// A delete on one side against a change on the other is the collision git reports worst: the
// side that kept the file usually holds the newer intent, and "take theirs" throws it away.
// Add/add is the same question for a whole file.
export function deletionHazards({ mine, theirs }) {
  const hazards = []
  const touched = (side) => new Set([
    ...side.added,
    ...side.modified,
    ...side.renamed.flatMap((entry) => [entry.from, entry.to]),
  ])
  const mineTouched = touched(mine)
  const theirsTouched = touched(theirs)
  for (const path of theirs.deleted) {
    if (mineTouched.has(path)) hazards.push(`${path}: deleted on the other side, changed on this one`)
  }
  for (const path of mine.deleted) {
    if (theirsTouched.has(path)) hazards.push(`${path}: deleted on this side, changed on the other`)
  }
  for (const path of theirs.added) {
    if (mine.added.includes(path)) hazards.push(`${path}: added on both sides`)
  }
  return hazards
}

// Files that exist on one side only are a merge's quietest loss: nothing conflicts about them,
// and when they are test files the runner just runs fewer of them than either branch did.
export function singleSideFiles(mineFiles, theirsFiles) {
  const theirs = new Set(theirsFiles)
  const mine = new Set(mineFiles)
  return {
    onlyMine: mineFiles.filter((file) => !theirs.has(file)),
    onlyTheirs: theirsFiles.filter((file) => !mine.has(file)),
  }
}

// The runner's projects are read out of the config text rather than imported: the copy in the
// merge result may still carry conflict markers, which no module loader would accept.
export function parseRunnerProjects(configText) {
  const marks = [...configText.matchAll(/name:\s*'(jsdom|node)'/g)]
    .map((match) => ({ name: match[1], at: match.index ?? 0 }))
  return marks.map((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1].at : configText.length
    const block = configText.slice(mark.at, end)
    return { name: mark.name, include: readArray(block, 'include'), exclude: readArray(block, 'exclude') }
  })
}

// `tests/**/*.test.ts` has to match `tests/one.test.ts` as well as `tests/a/b.test.ts`: the
// glob `**/` stands for zero or more directories, which is exactly how the runner reads it.
export function matchesPattern(pattern, file) {
  if (!pattern.includes('*')) return pattern === file
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000/')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000\//g, '(?:[^/]*/)*')
    .replace(/\u0001/g, '.*')
  return new RegExp(`^${source}$`).test(file)
}

// Both projects select from the same tree: a test file the jsdom project excludes has to be in
// the node project's include list, or nothing runs it and the suite simply shrinks.
export function selects(project, file) {
  return Boolean(project) &&
    project.include.some((pattern) => matchesPattern(pattern, file)) &&
    !project.exclude.some((pattern) => matchesPattern(pattern, file))
}

export function unselectedTests(projects, tests) {
  const selected = tests.map((file) => ({ file, by: projects.filter((project) => selects(project, file)) }))
  return {
    neverRuns: selected.filter((entry) => entry.by.length === 0).map((entry) => entry.file),
    runTwice: selected.filter((entry) => entry.by.length > 1).map((entry) => entry.file),
  }
}

export function nodeInclude(projects) {
  return projects.find((project) => project.name === 'node')?.include ?? []
}

// The trap this script exists for: a test file one side's config put in the node project, which
// a config taking the other side's list would hand back to jsdom. It fails on the harness it
// imports rather than staying silent, but CI should not be where the merge finds that out.
export function environmentIssues(projects, nodeOwned) {
  const node = projects.find((project) => project.name === 'node')
  const jsdom = projects.find((project) => project.name === 'jsdom')
  return nodeOwned
    .filter((file) => !selects(node, file) && selects(jsdom, file))
    .map((file) => `${file}: runs under jsdom although a node project owned it`)
}

export function runnerIssues(projects, tests, nodeOwned) {
  const { neverRuns, runTwice } = unselectedTests(projects, tests)
  return [
    ...neverRuns.map((file) => `${file}: selected by no project`),
    ...runTwice.map((file) => `${file}: selected by both projects`),
    ...environmentIssues(projects, nodeOwned),
  ]
}

function readArray(block, key) {
  const at = block.indexOf(`${key}: [`)
  if (at < 0) return []
  const start = block.indexOf('[', at)
  const end = closingBracket(block, start)
  if (end < 0) return []
  return [...block.slice(start + 1, end).matchAll(/'([^']+)'/g)].map((match) => match[1])
}

// Quoted strings may hold brackets of their own; entries here are paths, but a glob like
// `src/**/[id].ts` would otherwise close the array early.
function closingBracket(text, start) {
  let depth = 0
  for (let index = start; index < text.length; index++) {
    const character = text[index]
    if (character === "'" || character === '"' || character === '`') {
      const quote = character
      index++
      while (index < text.length && text[index] !== quote) index += text[index] === '\\' ? 2 : 1
      continue
    }
    if (character === '[') depth++
    else if (character === ']' && --depth === 0) return index
  }
  return -1
}

// Only stdout is read: merge-tree narrates what it merged on stderr, in the machine's own
// language, and none of that belongs in a report whose whole point is the file list. LC_ALL=C
// keeps path order and any message text the same on every machine.

// --- hazards only the compiler settles -----------------------------------------------------

// Top-level declaration names, exported or not. Exported-only would be the wrong view: the merge
// this was written for moved a *private* function out of app.ts into a new module, so nothing in
// an export list changed while the file the other side kept editing lost the declaration.
const DECLARATION_RE = /^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm

export function declaredNames(text) {
  const names = new Set()
  for (const match of text.matchAll(DECLARATION_RE)) names.add(match[1])
  return names
}

// Where a side put the declarations in the files it created: the destination a dissolved
// declaration normally reappears in, and what lets the report name it instead of only saying
// "one side removed something".
export function addedDeclarations({ files, readText }) {
  const byName = new Map()
  for (const file of files) {
    if (!TS_FILE_RE.test(file)) continue
    for (const name of declaredNames(readText(file))) if (!byName.has(name)) byName.set(name, file)
  }
  return byName
}

// A declaration one side took out of a file the other side was editing in place. Both edits are
// individually fine and only the merge is broken, so git reports nothing for either file —
// whichever way the resolution goes, the result has to be compiled before it is believed.
export function moveCrossings({ shared, readText, movedInto }) {
  const entries = []
  for (const file of shared) {
    if (!TS_FILE_RE.test(file)) continue
    const declared = {
      base: declaredNames(readText('base', file)),
      ours: declaredNames(readText('ours', file)),
      theirs: declaredNames(readText('theirs', file)),
    }
    entries.push(...sideCrossings({ file, side: 'ours', into: movedInto.ours, declared }))
    entries.push(...sideCrossings({ file, side: 'theirs', into: movedInto.theirs, declared }))
  }
  return entries.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
}

function sideCrossings({ file, side, into, declared }) {
  const other = side === 'ours' ? 'theirs' : 'ours'
  return [...declared.base]
    .filter((name) => !declared[side].has(name))
    .map((name) => ({ kind: into.has(name) ? 'moved' : 'dropped', file, name, side, into: into.get(name) ?? null }))
    // Without a destination this is still the same collision as long as the other side kept the
    // declaration: one side's deletion has to survive a file the other side was writing to.
    .filter((entry) => entry.kind === 'moved' || declared[other].has(entry.name))
}

// A module split moves a whole set of declarations at once, and one line each is how a report stops
// being read: the real merge below produced fifty crossings of which thirty-five were the same
// refactor under different names. Entries that differ only in the name become one group.
export function crossingGroups(entries, namesShown = 3) {
  const groups = new Map()
  for (const entry of entries) {
    const key = [entry.kind, entry.file, entry.side, entry.into ?? '', entry.from ?? ''].join('\u0000')
    if (!groups.has(key)) groups.set(key, { ...entry, names: [], namesShown })
    groups.get(key).names.push(entry.name)
  }
  return [...groups.values()].map((group) => ({ ...group, names: group.names.sort() }))
}

export function describeCrossing(group) {
  const here = group.side === 'ours' ? 'this side' : 'the other side'
  const there = group.side === 'ours' ? 'the other side' : 'this side'
  const names = (group.names ?? [group.name]).sort()
  const shown = names.slice(0, group.namesShown ?? 3)
  const rest = names.length - shown.length
  const subject = names.length === 1 ? names[0] : `${names.length} declarations (${shown.join(', ')}${rest > 0 ? ` +${rest} more` : ''})`
  if (group.kind === 'relocated') {
    const fate = group.into ? `moved into ${group.into}` : 'stopped exporting'
    return `${group.file}: ${here} still imports ${subject} from ${group.from}, which ${there} ${fate}`
  }
  return group.kind === 'moved'
    ? `${group.file}: ${here} moved ${subject} into ${group.into} while ${there} edited the file in place`
    : `${group.file}: ${here} removed ${subject}, which ${there} still declares in the file both sides changed`
}

// --- a name that moved from one module to another -------------------------------------------

// Every `import`/`export … from` clause in a file, with the names the other module has to export.
// The clause is matched across lines on purpose: a fifth of this repository's imports are written
// that way, and a line-based reader would miss them without saying so.
const FROM_RE = /(?:^|[\s;])(?:import|export)\s+([^'"]*?)\s*from\s*'([^']+)'/gm

export function importBindings(text) {
  const bindings = []
  for (const match of text.matchAll(FROM_RE)) {
    for (const name of clauseNames(match[1])) bindings.push({ name, from: match[2] })
  }
  return bindings
}

// The name the *module* has to export, not the local one: `import { a as b }` needs `a` to exist.
function clauseNames(clause) {
  const names = []
  for (const part of clause.replace(/\{[\s\S]*\}/, '').split(',')) {
    const name = part.replace(/\*[\s\S]*/, '').trim()
    if (name && name !== 'type' && /^[A-Za-z_$][\w$]*$/.test(name)) names.push(name)
  }
  const braced = clause.match(/\{([\s\S]*)\}/)
  if (!braced) return names
  for (const part of braced[1].split(',')) {
    const imported = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
    if (imported && /^[A-Za-z_$][\w$]*$/.test(imported)) names.push(imported)
  }
  return names
}

// The alias table TypeScript resolves with, read as text: loading the tsconfig files would tie this
// to a compiler, and the table is a couple of entries. First definition of a prefix wins, which is
// how the projects are layered here.
export function moduleAliases(configTexts) {
  const aliases = new Map()
  for (const text of configTexts) {
    for (const match of text.matchAll(/"([^"]*\/\*)"\s*:\s*\[\s*"([^"]+)"\s*\]/g)) {
      const prefix = match[1].replace(/\*$/, '')
      if (!aliases.has(prefix)) aliases.set(prefix, match[2].replace(/^\.\//, '').replace(/\*$/, ''))
    }
  }
  return aliases
}

// What a specifier could name, as the paths TypeScript itself would try: relative ones against the
// importing file, aliased ones against their target, then the extensions and the index files.
// Candidates rather than one answer because the caller holds the list of paths one side changed.
export function moduleCandidates({ specifier, fromFile, aliases = new Map() }) {
  let base = null
  if (specifier.startsWith('.')) {
    base = path.posix.join(path.posix.dirname(fromFile), specifier)
  } else {
    const prefix = [...aliases.keys()]
      .filter((key) => specifier.startsWith(key))
      .sort((a, b) => b.length - a.length)[0]
    if (prefix) base = `${aliases.get(prefix)}${specifier.slice(prefix.length)}`
  }
  if (!base) return []
  const normal = path.posix.normalize(base)
  return [normal, `${normal}.ts`, `${normal}.tsx`, `${normal}/index.ts`, `${normal}/index.tsx`]
}

// The names the base version of a file had and one side's version no longer declares.
export function droppedNamesIn({ file, side, readText }) {
  const after = declaredNames(readText(side, file))
  return new Set([...declaredNames(readText('base', file))].filter((name) => !after.has(name)))
}

// Every import in the files one side touched, resolved as far as the alias table reaches. Only
// these files can hold the stale edge, so nothing else in either tree is read.
export function resolvedImports({ files, readText, aliases }) {
  const imports = []
  for (const file of [...new Set(files)].sort()) {
    if (!TS_FILE_RE.test(file)) continue
    for (const binding of importBindings(readText(file))) {
      imports.push({
        file,
        name: binding.name,
        candidates: moduleCandidates({ specifier: binding.from, fromFile: file, aliases }),
      })
    }
  }
  return imports
}

// A name one side took out of a module that the other side's files still import it from. The two
// edits live in different files, which is why no conflict marker points at either: replayed on the
// merge this was written for, the extracted `security-headers.ts` — auto-merged whole — keeps
// importing `mergeSettings` from `@shared/constants` while the `constants.ts` the merge keeps has
// stopped exporting it, and neither path is in the conflict list.
//
// Only the modules some import actually names are read back, which is what keeps this affordable: a
// merge that touched 484 files asks for a few dozen blob reads, not a thousand.
export function relocationCrossings({ droppedBy, imports, changedByOther, readText, movedInto }) {
  const importer = droppedBy === 'theirs' ? 'ours' : 'theirs'
  const dropped = new Map()
  const droppedIn = (file) => {
    if (!dropped.has(file)) dropped.set(file, droppedNamesIn({ file, side: droppedBy, readText }))
    return dropped.get(file)
  }
  const entries = []
  const seen = new Set()
  for (const { file, name, candidates } of imports) {
    const from = candidates.find((candidate) => changedByOther.has(candidate) && droppedIn(candidate).has(name))
    if (!from) continue
    const key = `${file}\u0000${name}\u0000${from}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ kind: 'relocated', file, name, side: importer, from, into: movedInto.get(name) ?? null })
  }
  return entries.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
}

// A merge commit is a commit, so it gets the compile and the related tests a hand-made one gets —
// git runs pre-merge-commit *instead of* pre-commit, which is why this is asked here. The smoke
// group is the crossings' own files rather than everything the merge touched, and its cost was
// measured both ways on the two sides of the last real merge: a narrow crossing (app.ts plus the
// module a private function moved into) pulls one test file, 3 tests, 19s, and it is the test that
// covers the semantics at issue; a module-wide move (36 declarations out of @shared/constants, four
// stale imports of them) pulls 179 files / 1447 tests / 67s, because those files are the ones half
// the tree imports. That is the price of judging a refactor's merge, and it is paid only when a
// crossing exists — with INKSTONE_SKIP_MERGE_VERIFY=1 named in the output as the way out.
export function mergeVerificationPlan({ stagedTs, crossings }) {
  const rearranged = crossings.flatMap((entry) => [entry.file, entry.into]).filter(Boolean)
  return {
    typecheck: stagedTs.length > 0,
    smokeFiles: [...new Set(rearranged)].sort(),
  }
}
