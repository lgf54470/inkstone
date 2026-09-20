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
import {
  CONFIG_PATH,
  CONFLICT_MARKER,
  ENFORCED_PREFIXES,
  OVERRIDE_ENV,
  SKIP_VERIFY_ENV,
  START_MARKER_RE,
  TEST_FILE_RE,
  addedDeclarations,
  classifyChanges,
  declaredNames,
  deletionHazards,
  crossingGroups,
  describeCrossing,
  environmentIssues,
  matchesPattern,
  mergeVerificationPlan,
  moduleAliases,
  moveCrossings,
  nodeInclude,
  parseMergeTreeOutput,
  parseRunnerProjects,
  relocationCrossings,
  resolvedImports,
  runnerIssues,
  selects,
  singleSideFiles,
  unselectedTests,
} from './merge-preflight-analysis.mjs'

// Where the alias tables live. Read as text rather than loaded, so the analysis stays free of the
// TypeScript compiler.
const TS_CONFIG_PATH = ['tsconfig.json', 'tsconfig.client.json', 'tsconfig.node.json', 'tsconfig.worker.json']

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
  // A path one side deleted or renamed away is not in that side's revision, and `git show` fails
  // with 128 rather than saying so: an absent file has no declarations and no imports, which is the
  // answer every caller wants. Measured on the real merge this was written for, whose sides deleted
  // paths that the other side still had.
  const readText = (side, file) => gitOrEmpty(['show', `${revisions[side]}:${file}`], [128])
  // A merge is only as safe as its result, so the plan is built from the index git is about to
  // commit rather than from either side: `--cached` against HEAD is what the merge brings in.
  const stagedTs = lines(gitOrEmpty(['diff', '--cached', '--name-only', '--diff-filter=ACM', '--', '*.ts', '*.tsx']))
  const movedInto = {
    ours: addedDeclarations({ files: addedBy('HEAD'), readText: (file) => readText('ours', file) }),
    theirs: addedDeclarations({ files: addedBy(other), readText: (file) => readText('theirs', file) }),
  }
  const touchedBy = (side) => [...changedBy(side), ...addedBy(side)]
  const aliases = moduleAliases(TS_CONFIG_PATH.map((file) => readConfig(root, file)))
  // Both directions: either side can be the one holding an import of a name the other moved away.
  const relocations = [
    ...relocationCrossings({
      droppedBy: 'theirs',
      readText,
      changedByOther: new Set(touchedBy(other)),
      imports: resolvedImports({ files: touchedBy('HEAD'), readText: (file) => readText('ours', file), aliases }),
      movedInto: movedInto.theirs,
    }),
    ...relocationCrossings({
      droppedBy: 'ours',
      readText,
      changedByOther: new Set(touchedBy('HEAD')),
      imports: resolvedImports({ files: touchedBy(other), readText: (file) => readText('theirs', file), aliases }),
      movedInto: movedInto.ours,
    }),
  ]
  const crossings = [...moveCrossings({ shared, readText, movedInto }), ...relocations]
    .sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
  return { other, base, snapshot, nodeOwned, markers, lostAdditions, shared, crossings, stagedTs, mergedFrom: merged.from }
}

// The alias tables the resolution has to know about, as text: whatever the tree being judged
// declares. Missing files are simply not part of the table.
function readConfig(root, file) {
  const full = path.join(root, file)
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : ''
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
  const groups = crossingGroups(facts.crossings)
  console.log(`[crossings] both sides changed ${facts.shared.length} file(s); ${facts.crossings.length} crossing(s) in ${groups.length} group(s) between a declaration and the files that read it`)
  for (const group of groups) console.log(`  - ${describeCrossing(group)}`)

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
