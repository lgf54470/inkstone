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
// `--verify` (used by the hook) then runs what no finding above can decide: `tsc -b` on the merge
// result, and the tests related to the files a refactor crossing passed through. A merge commit is
// a commit, and git runs pre-merge-commit *instead of* pre-commit when it creates one — measured:
// with no pre-merge-commit in place, `git merge` runs no hook at all — so whatever pre-commit
// would have checked has to be asked here. The compile step is what catches the hazards where the
// conflict list points at the wrong files. Replaying the merge this was written for
// (`git merge-tree --write-tree 9351a982 022aaf46`) conflicts on eight paths — app.ts, hooks.ts,
// vite.config.ts, vitest.config.ts, the comment allowlist and three components — and silently
// auto-merges two others: security-headers.ts, the module ours had just extracted, still imports
// mergeSettings from @shared/constants, and the constants.ts the merge keeps no longer exports it.
// Neither of those two is in the conflict list, so nothing a human reads while resolving app.ts
// says the resolution will not compile.
// Set INKSTONE_SKIP_MERGE_VERIFY=1 to skip the compile and the tests deliberately; it is a
// separate switch from the findings so that a tree which cannot be compiled mid-refactor does not
// push anyone to --no-verify, which would skip the findings too.
//
// Usage: node scripts/check-merge-preflight.mjs [other-branch] [this-branch] [--report]
//        node scripts/check-merge-preflight.mjs --in-progress [--verify]
//   other-branch defaults to `dev`, this-branch to `HEAD`: it reports what merging the first
//   into the second would hit. `--report` also lists every file both sides changed.
//   The exit code is 1 when it found a hazard (or, with --in-progress, a blocker) and 0
//   otherwise, so a caller can branch on it.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_FILE_RE = /\.test\.tsx?$/
const TS_FILE_RE = /\.(ts|tsx|mts|cts)$/
const CONFIG_PATH = 'vitest.config.ts'
const CONFLICT_MARKER = '<<<<<<<'
const START_MARKER_RE = '^<<<<<<< '
const OVERRIDE_ENV = 'INKSTONE_ALLOW_MERGE_HAZARDS'
const SKIP_VERIFY_ENV = 'INKSTONE_SKIP_MERGE_VERIFY'
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
  const removed = [...declared.base].filter((name) => !declared[side].has(name))
  return removed.map((name) => ({
    file,
    name,
    side,
    into: into.get(name) ?? null,
    // Without a destination this is still the same collision as long as the other side kept the
    // declaration: one side's deletion has to survive a file the other side was writing to.
    stillThereOnTheOtherSide: declared[other].has(name),
  })).filter((entry) => entry.into || entry.stillThereOnTheOtherSide)
}

export function describeCrossing(entry) {
  const here = entry.side === 'ours' ? 'this side' : 'the other side'
  const there = entry.side === 'ours' ? 'the other side' : 'this side'
  return entry.into
    ? `${entry.file}: ${here} moved ${entry.name} into ${entry.into} while ${there} edited the file in place`
    : `${entry.file}: ${here} removed ${entry.name}, which ${there} still declares in the file both sides changed`
}

// A merge commit is a commit, so it gets the compile and the related tests a hand-made one gets —
// git runs pre-merge-commit *instead of* pre-commit, which is why this is asked here. The smoke
// group is the crossings' own files rather than everything the merge touched: the two sides of the
// last real merge shared 30 files, whose related tests measured 179 files / 1447 tests / 132s,
// while the crossing files alone pulled in exactly the one test that covers the semantics at
// issue (tests/security-headers.test.ts, 3 tests).
export function mergeVerificationPlan({ stagedTs, crossings }) {
  const rearranged = crossings.flatMap((entry) => [entry.file, entry.into]).filter(Boolean)
  return {
    typecheck: stagedTs.length > 0,
    smokeFiles: [...new Set(rearranged)].sort(),
  }
}

export function mergeVerificationSteps({ plan, root }) {
  const steps = []
  if (plan.typecheck) steps.push({ label: 'typecheck', command: 'npm', args: ['run', 'typecheck', '--silent'] })
  const smokeFiles = plan.smokeFiles.filter((file) => fs.existsSync(path.join(root, file)))
  if (smokeFiles.length) {
    steps.push({
      label: `the tests related to ${smokeFiles.length} file(s) the merge re-arranged`,
      command: 'npx',
      args: ['--no-install', 'vitest', 'related', '--run', ...smokeFiles, '--passWithNoTests', '--testTimeout=30000'],
    })
  }
  return steps
}

function runCommand({ command, args, cwd }) {
  try {
    const output = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, output: String(output) }
  } catch (error) {
    return {
      status: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() || String(error.message ?? error),
    }
  }
}

// The command runner is injected so the decision (which steps, in what order) stays testable
// without compiling anything; the CLI passes the real one.
export function runMergeVerification({ plan, root, run = runCommand, log = console.log }) {
  const steps = mergeVerificationSteps({ plan, root })
  const failures = []
  for (const step of steps) {
    log(`[verify] ${step.label}: ${step.command} ${step.args.join(' ')}`)
    const result = run({ command: step.command, args: step.args, cwd: root })
    if (result.status === 0) {
      log(`[verify] ok: ${step.label}`)
      continue
    }
    // Stop at the first failure: the second step's answer is not worth waiting for once the merge
    // result is known to be broken, and the first one is the cheaper of the two.
    failures.push({ label: step.label, output: result.output })
    break
  }
  return { failures, steps }
}

// Which head is being merged in. The merge git commits itself is the case that made this
// necessary: a merge with no conflicts is recorded by `git merge`, and when pre-merge-commit runs
// for it MERGE_HEAD does not exist yet — measured on git 2.55, the hook sees ORIG_HEAD, AUTO_MERGE
// and the index, and no MERGE_HEAD, so reading only that file made the whole gate pass in silence
// for exactly the merges it exists to judge. Git does relay the head being merged to the hook as
// GITHEAD_<sha>=<ref> (not in the documentation; measured), which is what the fallback reads. The
// conflicted and --no-commit paths keep MERGE_HEAD, which is the documented state and wins when
// both are present.
export function mergedHead(environment = process.env) {
  const head = gitOrEmpty(['rev-parse', '--verify', 'MERGE_HEAD'], [128])
  if (head) return { revision: head, from: 'MERGE_HEAD' }
  const relayed = Object.keys(environment).find((key) => /^GITHEAD_[0-9a-f]{40,64}$/.test(key))
  if (!relayed) return null
  return { revision: relayed.slice('GITHEAD_'.length), from: `${relayed}=${environment[relayed]}` }
}

// A hook can be run by hand, so "no merge is being recorded" is an answer, not an error: it asks for
// the merge state rather than requiring it.
export function inspectInProgress(root = process.cwd()) {
  const merged = mergedHead()
  if (!merged) return null
  const other = merged.revision
  const base = git(['merge-base', 'HEAD', other])
  const snapshot = readRunnerSnapshot(root)
  const nodeOwned = [...new Set([
    ...nodeInclude(parseRunnerProjects(configOf('HEAD'))),
    ...nodeInclude(parseRunnerProjects(configOf(other))),
  ])].filter((file) => snapshot.tests.includes(file)).sort()
  const markers = lines(gitOrEmpty(['grep', '--cached', '-l', '-e', START_MARKER_RE], [1]))
  const addedBy = (side) => lines(gitOrEmpty(['diff', '--name-only', '--diff-filter=A', base, side]))
  const lostAdditions = ['HEAD', other]
    .flatMap((side) => addedBy(side))
    .filter((file) => !fs.existsSync(path.join(root, file)))
    .sort()
  const changedBy = (side) => new Set(lines(gitOrEmpty(['diff', '--name-only', base, side])))
  const theirsChanged = changedBy(other)
  const shared = lines(gitOrEmpty(['diff', '--name-only', base, 'HEAD']))
    .filter((file) => theirsChanged.has(file))
    .sort()
  const revisions = { base, ours: 'HEAD', theirs: other }
  const readText = (side, file) => gitOrEmpty(['show', `${revisions[side]}:${file}`])
  // A merge is only as safe as its result, so the plan is built from the index git is about to
  // commit rather than from either side: `--cached` against HEAD is what the merge brings in.
  const stagedTs = lines(gitOrEmpty(['diff', '--cached', '--name-only', '--diff-filter=ACM', '--', '*.ts', '*.tsx']))
  const crossings = moveCrossings({
    shared,
    readText,
    movedInto: {
      ours: addedDeclarations({ files: addedBy('HEAD'), readText: (file) => readText('ours', file) }),
      theirs: addedDeclarations({ files: addedBy(other), readText: (file) => readText('theirs', file) }),
    },
  })
  return { other, base, snapshot, nodeOwned, markers, lostAdditions, shared, crossings, stagedTs, mergedFrom: merged.from }
}

// How much of a failing command's output to show: the tail is where tsc and vitest put the
// errors, and reading them in the hook's own output is what makes the refusal actionable.
const OUTPUT_TAIL_LINES = 15

function mainInProgress({ verify = false, root = process.cwd() } = {}) {
  const facts = inspectInProgress(root)
  if (!facts) {
    console.log('[preflight] no merge is being recorded (no MERGE_HEAD, no GITHEAD_* relay): nothing to check')
    return
  }
  const runner = { issues: runnerIssues(facts.snapshot.projects, facts.snapshot.tests, facts.nodeOwned) }
  const findings = mergeBlockers({ markers: facts.markers, runner, lostAdditions: facts.lostAdditions })
  const accepted = process.env[OVERRIDE_ENV] === '1'
  const ignored = facts.lostAdditions.length - findings.filter((entry) => entry.includes('absent from the result')).length
  console.log(`[preflight] merge in progress: ${facts.other.slice(0, 8)} into HEAD, base ${facts.base.slice(0, 8)} (head from ${facts.mergedFrom})`)
  console.log(`[preflight] result on disk: ${facts.snapshot.tests.length} test file(s), ${facts.nodeOwned.length} of them node-owned before the merge`)
  if (ignored > 0) console.log(`[preflight] ${ignored} addition(s) outside the code and test trees are absent and not enforced`)
  printList('[blockers]', findings)
  if (!findings.length) console.log('[preflight] no blocker: the resolution keeps every test where it belonged')
  console.log(`[crossings] both sides changed ${facts.shared.length} file(s); ${facts.crossings.length} declaration(s) left a file the other side was editing`)
  for (const entry of facts.crossings) console.log(`  - ${describeCrossing(entry)}`)

  const plan = mergeVerificationPlan({ stagedTs: facts.stagedTs, crossings: facts.crossings })
  const owed = mergeVerificationSteps({ plan, root })
  console.log(owed.length
    ? `[verify] owed by this merge: ${owed.map((step) => step.label).join('; ')}`
    : '[verify] nothing owed: the merge brings in no TypeScript and re-arranged no file')

  // Fail fast: a resolution already refused should not cost a compile.
  if (findings.length && !accepted) {
    console.log(`[preflight] refusing this merge commit: resolve the entries above, or set ${OVERRIDE_ENV}=1 to accept them deliberately`)
    process.exitCode = 1
    return
  }
  if (findings.length) console.log(`[preflight] accepted deliberately through ${OVERRIDE_ENV}=1: the findings above are on the record, not resolved`)
  if (!verify) return
  if (process.env[SKIP_VERIFY_ENV] === '1') {
    console.log(`[verify] skipped through ${SKIP_VERIFY_ENV}=1: the compile and the related tests did not run`)
    return
  }
  const { failures, steps } = runMergeVerification({ plan, root })
  if (!steps.length) return
  for (const failure of failures) {
    console.log(`[verify] ${failure.label} failed:`)
    for (const line of failure.output.split('\n').slice(-OUTPUT_TAIL_LINES)) console.log(`    ${line}`)
  }
  if (!failures.length) {
    console.log('[verify] the result compiles and the tests related to what it re-arranged pass')
    return
  }
  console.log(`[verify] refusing this merge commit: the result on disk does not pass the ${failures.length} check(s) above`)
  process.exitCode = 1
}

// The analysis above is imported by tests/merge-preflight.test.ts, so running the report is
// reserved for the command line rather than for importing the module. Both sides are resolved
// through the filesystem: node resolves a symlinked entry point to its real path in
// import.meta.url but leaves argv[1] as the symlink, so comparing the two as written made a
// symlinked invocation — how a hook or a fixture can install this script — print nothing and exit
// 0, which is the silent pass this gate exists to prevent.
const isMain = (() => {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return path.resolve(entry) === fileURLToPath(import.meta.url)
  }
})()
if (isMain) {
  const argv = process.argv.slice(2)
  if (argv.includes('--in-progress')) mainInProgress({ verify: argv.includes('--verify') })
  else main()
}
