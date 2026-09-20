// Pre-merge inspection: what will a merge of two diverged branches actually collide with?
//
// Written after a 115-commit branch was merged into `dev` and two of the collisions were only
// visible by reading them. The runner config listed test files that exist on one side only, so
// resolving that conflict the easy way (take one side) moves them between projects. Measured on
// that tree afterwards: a file dropped from the node include and left to jsdom either passes
// there anyway (offline-audio-sw) or fails with errors that read like product bugs — `The upload
// form is invalid`, expected 400 to be 201 — as music-playlist-share does; and a file missing
// from both lists is run by nothing at all. And app.ts had moved its security-header code into a
// module on one side while the other edited it in place, so git produced code that did not
// compile while reporting no conflict for either file. Reading the conflict list by eye found
// neither.
//
// It changes nothing: `git merge-tree --write-tree` computes the merge in memory and writes only
// tree objects (no ref, no index, no working tree); everything else is `rev-list`, `diff`,
// `ls-tree` and `show`. Run it before the merge, not after.
//
// `--in-progress` is the same question asked once the resolution is on disk, which is why it is
// what `.githooks/pre-merge-commit` and the merge branch of `.githooks/pre-commit` run: a merge
// that is about to be recorded has to have kept every test in the project that owned it, kept
// every file the other side added, and kept no conflict marker in the staged content. Blocking
// there is the point — the two hazards this script exists for are both invisible in the conflict
// list, so "run it if you remember" would have caught neither. Set
// INKSTONE_ALLOW_MERGE_HAZARDS=1 to accept the findings deliberately (the message says so too),
// which is still better than --no-verify, because it skips only this check.
//
// Usage: node scripts/check-merge-preflight.mjs [other-branch] [this-branch] [--report]
//        node scripts/check-merge-preflight.mjs --in-progress
//   other-branch defaults to `dev`, this-branch to `HEAD`: it reports what merging the first
//   into the second would hit. `--report` also lists every file both sides changed.
//   The exit code is 1 when it found a hazard (or, with --in-progress, a blocker) and 0
//   otherwise, so a caller can branch on it.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_FILE_RE = /\.test\.tsx?$/
const CONFIG_PATH = 'vitest.config.ts'
const CONFLICT_MARKER = '<<<<<<<'
const START_MARKER_RE = '^<<<<<<< '
const OVERRIDE_ENV = 'INKSTONE_ALLOW_MERGE_HAZARDS'
// A merge that drops a file one side added has thrown away somebody's work, but only the code
// and test trees are worth refusing the commit over: `.qoder/`-style bookkeeping is per branch by
// nature, so a drop there is reported and not enforced.
const ENFORCED_PREFIXES = ['src/', 'tests/', 'scripts/', 'blog-frontend/']

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
function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LC_ALL: 'C' },
  }).trim()
}

function gitOrEmpty(args, allowedExitCodes = []) {
  try {
    return git(args)
  } catch (error) {
    if (allowedExitCodes.includes(error.status)) return String(error.stdout ?? '').trim()
    throw error
  }
}

function lines(text) {
  return text ? text.split('\n').filter(Boolean) : []
}

function testsInTree(treeish) {
  return lines(git(['ls-tree', '-r', '--name-only', treeish, '--', 'tests', 'src']))
    .filter((file) => TEST_FILE_RE.test(file))
    .sort()
}

function configOf(treeish) {
  try {
    return git(['show', `${treeish}:${CONFIG_PATH}`])
  } catch {
    // A branch without the runner config is not a finding: the merge takes the other side's.
    return ''
  }
}

function treeFile(tree, path) {
  if (!tree) return ''
  try {
    return git(['show', `${tree}:${path}`])
  } catch {
    return ''
  }
}

export function inspect({ mine, other }) {
  const base = git(['merge-base', mine, other])
  const [behind, ahead] = git(['rev-list', '--left-right', '--count', `${mine}...${other}`])
    .split(/\s+/).map(Number)
  // `--no-messages` is what keeps this a file list: without it merge-tree narrates every path it
  // merged into stdout as well, and those sentences would read as conflicted files.
  const merge = parseMergeTreeOutput(gitOrEmpty(['merge-tree', '--write-tree', '--name-only', '--no-messages', mine, other], [1]))
  const mineChanges = classifyChanges(gitOrEmpty(['diff', '--name-status', '-M', base, mine]))
  const theirsChanges = classifyChanges(gitOrEmpty(['diff', '--name-status', '-M', base, other]))
  const theirsTests = testsInTree(other)
  const { onlyMine, onlyTheirs } = singleSideFiles(testsInTree(mine), theirsTests)
  return {
    mine,
    other,
    base,
    ahead,
    behind,
    merge,
    mineChanges,
    theirsChanges,
    mineProjects: parseRunnerProjects(configOf(mine)),
    theirsProjects: parseRunnerProjects(configOf(other)),
    mergedTests: merge.tree ? testsInTree(merge.tree) : [],
    mergedConfig: treeFile(merge.tree, CONFIG_PATH),
    onlyMine,
    onlyTheirs,
  }
}

function runnerOutcome(facts) {
  const tests = facts.mergedTests.length ? facts.mergedTests : [...facts.onlyMine, ...facts.onlyTheirs].sort()
  const nodeOwned = [...new Set([...nodeInclude(facts.mineProjects), ...nodeInclude(facts.theirsProjects)])]
    .filter((file) => tests.includes(file))
    .sort()
  if (facts.mergedConfig.includes(CONFLICT_MARKER)) {
    return {
      issues: [],
      // The config being conflicted is itself the finding: neither side's list is usable alone,
      // and the two lines below say what each one would break if it were.
      hazardCount: 1,
      notes: [
        'the runner config is conflicted: the two lists below have to be merged by block, not picked',
        ...[{ label: facts.mine, projects: facts.mineProjects }, { label: facts.other, projects: facts.theirsProjects }]
          .map(({ label, projects }) => sideTakenAlone(label, runnerIssues(projects, tests, nodeOwned))),
      ],
    }
  }
  const projects = parseRunnerProjects(facts.mergedConfig)
  const issues = runnerIssues(projects, tests, nodeOwned)
  return { issues, hazardCount: issues.length, notes: [] }
}

function sideTakenAlone(label, issues) {
  if (!issues.length) return `${label}'s list alone keeps every test in the project that owned it`
  return `${label}'s list alone breaks ${issues.length}: ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3})` : ''}`
}

// Only the single-side tests one side's config actually names matter here: the rest are covered
// by the jsdom include glob on either side, so a wrong pick does not change where they run.
function namedInRunner(facts) {
  const named = [...facts.mineProjects, ...facts.theirsProjects].flatMap((project) => [...project.include, ...project.exclude])
  return [...facts.onlyMine, ...facts.onlyTheirs].filter((file) => named.includes(file)).sort()
}

function printList(heading, entries, limit = Infinity) {
  if (!entries.length) return
  console.log(`${heading} (${entries.length}):`)
  for (const entry of entries.slice(0, limit)) console.log(`  - ${entry}`)
  if (entries.length > limit) console.log(`  … and ${entries.length - limit} more`)
}

function main() {
  const argv = process.argv.slice(2)
  const withReport = argv.includes('--report')
  const [other = 'dev', mine = 'HEAD'] = argv.filter((arg) => !arg.startsWith('--'))
  const facts = inspect({ mine, other })
  const runner = runnerOutcome(facts)
  const deletions = deletionHazards({ mine: facts.mineChanges, theirs: facts.theirsChanges })
  const namedTests = namedInRunner(facts)
  const bothSides = bothChanged(facts)
  const hazards = facts.merge.conflicts.length + deletions.length + runner.hazardCount

  console.log(`[preflight] merging ${other} (${git(['rev-parse', '--short', other])}) into ${mine} (${git(['rev-parse', '--short', mine])}), base ${facts.base.slice(0, 8)}`)
  console.log(`[preflight] divergence: ${facts.ahead} ahead here, ${facts.behind} ahead there`)
  console.log(`[preflight] both sides changed ${bothSides.length} file(s) since the base`)
  if (withReport) printList('[preflight]', bothSides)
  printList('[conflicts] resolve by block', facts.merge.conflicts)
  if (!facts.merge.conflicts.length) console.log('[conflicts] none')
  printList('[deletions] delete/add collision', deletions)
  if (!deletions.length) console.log('[deletions] none')
  console.log(`[tests] one side only: ${facts.onlyMine.length} here, ${facts.onlyTheirs.length} there; a runner config names ${namedTests.length} of them`)
  if (withReport) printList('[tests] named in one side\'s config', namedTests)
  for (const note of runner.notes) console.log(`[runner] ${note}`)
  if (!runner.notes.length) console.log(`[runner] merged tree: ${runner.issues.length} test file(s) the config would not run where it should`)
  printList('[runner]', runner.issues)
  console.log(hazards
    ? `[preflight] ${hazards} hazard(s): the entries above are what a verbatim side would lose`
    : '[preflight] no hazards: this merge is mechanical')
  process.exitCode = hazards ? 1 : 0
}

function bothChanged(facts) {
  const theirs = new Set([
    ...facts.theirsChanges.added,
    ...facts.theirsChanges.modified,
    ...facts.theirsChanges.renamed.map((entry) => entry.to),
  ])
  return [...facts.mineChanges.added, ...facts.mineChanges.modified, ...facts.mineChanges.renamed.map((entry) => entry.to)]
    .filter((path) => theirs.has(path))
    .sort()
}

// --- the same question, asked of a resolution already made ---------------------------------

// The merge result is the working tree, so the runner is read from disk: the config that is
// about to be committed, against the test files that are about to be committed.
export function readRunnerSnapshot(root) {
  const configPath = path.join(root, CONFIG_PATH)
  return {
    projects: fs.existsSync(configPath) ? parseRunnerProjects(fs.readFileSync(configPath, 'utf8')) : [],
    tests: testFilesUnder(root),
  }
}

function testFilesUnder(root) {
  return ['src', 'tests'].flatMap((dir) => {
    const full = path.join(root, dir)
    if (!fs.existsSync(full)) return []
    return fs.readdirSync(full, { recursive: true, encoding: 'utf8' })
      .filter((entry) => TEST_FILE_RE.test(entry))
      .map((entry) => `${dir}/${entry.split(path.sep).join('/')}`)
  }).sort()
}

export function mergeBlockers({ markers, runner, lostAdditions }) {
  return [
    ...markers.map((file) => `${file}: a conflict marker is still in the staged content`),
    ...runner.issues,
    ...lostAdditions
      .filter((file) => ENFORCED_PREFIXES.some((prefix) => file.startsWith(prefix)))
      .map((file) => `${file}: added on one side of this merge but absent from the result`),
  ]
}

// A hook can be run by hand, so "no merge is in progress" is an answer, not an error: it reads
// MERGE_HEAD rather than requiring it.
export function inspectInProgress(root = process.cwd()) {
  const other = gitOrEmpty(['rev-parse', '--verify', 'MERGE_HEAD'], [128])
  if (!other) return null
  const base = git(['merge-base', 'HEAD', other])
  const snapshot = readRunnerSnapshot(root)
  const nodeOwned = [...new Set([
    ...nodeInclude(parseRunnerProjects(configOf('HEAD'))),
    ...nodeInclude(parseRunnerProjects(configOf(other))),
  ])].filter((file) => snapshot.tests.includes(file)).sort()
  const markers = lines(gitOrEmpty(['grep', '--cached', '-l', '-e', START_MARKER_RE], [1]))
  const lostAdditions = ['HEAD', other]
    .flatMap((side) => lines(gitOrEmpty(['diff', '--name-only', '--diff-filter=A', base, side])))
    .filter((file) => !fs.existsSync(path.join(root, file)))
    .sort()
  return { other, base, snapshot, nodeOwned, markers, lostAdditions }
}

function mainInProgress() {
  const facts = inspectInProgress()
  if (!facts) {
    console.log('[preflight] no merge in progress: nothing to check (the branch form inspects one before it starts)')
    return
  }
  const runner = { issues: runnerIssues(facts.snapshot.projects, facts.snapshot.tests, facts.nodeOwned) }
  const blockers = mergeBlockers({ markers: facts.markers, runner, lostAdditions: facts.lostAdditions })
  const ignored = facts.lostAdditions.length - blockers.filter((entry) => entry.includes('absent from the result')).length
  console.log(`[preflight] merge in progress: ${facts.other.slice(0, 8)} into HEAD, base ${facts.base.slice(0, 8)}`)
  console.log(`[preflight] result on disk: ${facts.snapshot.tests.length} test file(s), ${facts.nodeOwned.length} of them node-owned before the merge`)
  if (ignored > 0) console.log(`[preflight] ${ignored} addition(s) outside the code and test trees are absent and not enforced`)
  printList('[blockers]', blockers)
  if (!blockers.length) {
    console.log('[preflight] no blocker: the resolution keeps every test where it belonged')
    return
  }
  if (process.env[OVERRIDE_ENV] === '1') {
    console.log(`[preflight] accepted deliberately through ${OVERRIDE_ENV}=1: the findings above are on the record, not resolved`)
    return
  }
  console.log(`[preflight] refusing this merge commit: resolve the entries above, or set ${OVERRIDE_ENV}=1 to accept them deliberately`)
  process.exitCode = 1
}

// The analysis above is imported by tests/merge-preflight.test.ts, so running the report is
// reserved for the command line rather than for importing the module.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.slice(2).includes('--in-progress')) mainInProgress()
  else main()
}
