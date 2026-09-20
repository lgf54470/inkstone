import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyChanges,
  deletionHazards,
  environmentIssues,
  matchesPattern,
  mergeBlockers,
  nodeInclude,
  parseMergeTreeOutput,
  parseRunnerProjects,
  readRunnerSnapshot,
  runnerIssues,
  singleSideFiles,
  unselectedTests,
} from '../scripts/check-merge-preflight.mjs'

// The two commands below are what the script reads: merge-tree's conflicted-path list, and a
// `--name-status` diff. Both are shapes the real commands produce, kept as text here so the
// parsing stays testable without a repository.
describe('merge-tree output', () => {
  it('reads the tree id off the first line and every path after it as a conflict', () => {
    expect(parseMergeTreeOutput('abc123\nsrc/a.ts\nsrc/b.ts\n')).toEqual({
      tree: 'abc123',
      conflicts: ['src/a.ts', 'src/b.ts'],
    })
  })

  it('reports no conflict for a tree with nothing after it', () => {
    expect(parseMergeTreeOutput('abc123\n')).toEqual({ tree: 'abc123', conflicts: [] })
  })

  it('has nothing to read from an empty answer', () => {
    expect(parseMergeTreeOutput('')).toEqual({ tree: null, conflicts: [] })
  })
})

describe('name-status classification', () => {
  it('sorts each side of the merge into added, modified, deleted and renamed', () => {
    const changes = classifyChanges([
      'A\tsrc/new.ts',
      'M\tsrc/changed.ts',
      'D\tsrc/gone.ts',
      'R100\tsrc/old.ts\tsrc/moved.ts',
      'T\tsrc/link.ts',
    ].join('\n'))
    expect(changes.added).toEqual(['src/new.ts'])
    expect(changes.modified).toEqual(['src/changed.ts', 'src/link.ts'])
    expect(changes.deleted).toEqual(['src/gone.ts'])
    expect(changes.renamed).toEqual([{ from: 'src/old.ts', to: 'src/moved.ts' }])
  })
})

describe('delete and add collisions', () => {
  const changed = (paths: string[]) => ({ added: [], modified: paths, deleted: [], renamed: [] })
  const deleted = (paths: string[]) => ({ added: [], modified: [], deleted: paths, renamed: [] })

  it('flags a file the other side deleted while this one changed it', () => {
    expect(deletionHazards({ mine: changed(['src/a.ts']), theirs: deleted(['src/a.ts']) }))
      .toEqual(['src/a.ts: deleted on the other side, changed on this one'])
  })

  it('flags the same collision the other way round', () => {
    expect(deletionHazards({ mine: deleted(['src/a.ts']), theirs: changed(['src/a.ts']) }))
      .toEqual(['src/a.ts: deleted on this side, changed on the other'])
  })

  it('counts a rename on one side as touching the path it moved away from', () => {
    const mine = { added: [], modified: [], deleted: [], renamed: [{ from: 'src/a.ts', to: 'src/b.ts' }] }
    expect(deletionHazards({ mine, theirs: deleted(['src/a.ts']) }))
      .toEqual(['src/a.ts: deleted on the other side, changed on this one'])
  })

  it('flags a path both sides added', () => {
    const added = (paths: string[]) => ({ added: paths, modified: [], deleted: [], renamed: [] })
    expect(deletionHazards({ mine: added(['src/a.ts']), theirs: added(['src/a.ts']) }))
      .toEqual(['src/a.ts: added on both sides'])
  })

  it('stays quiet when the two sides touched different files', () => {
    expect(deletionHazards({ mine: changed(['src/a.ts']), theirs: changed(['src/b.ts']) })).toEqual([])
  })
})

describe('files and tests that exist on one side only', () => {
  it('splits the two directions', () => {
    expect(singleSideFiles(['tests/a.test.ts', 'tests/b.test.ts'], ['tests/b.test.ts', 'tests/c.test.ts']))
      .toEqual({ onlyMine: ['tests/a.test.ts'], onlyTheirs: ['tests/c.test.ts'] })
  })
})

describe('runner glob matching', () => {
  it('treats the double star as zero or more directories', () => {
    expect(matchesPattern('tests/**/*.test.ts', 'tests/one.test.ts')).toBe(true)
    expect(matchesPattern('tests/**/*.test.ts', 'tests/a/b.test.ts')).toBe(true)
    expect(matchesPattern('src/**/*.test.ts', 'tests/one.test.ts')).toBe(false)
  })

  it('matches an exact path only for itself', () => {
    expect(matchesPattern('tests/one.test.ts', 'tests/one.test.ts')).toBe(true)
    expect(matchesPattern('tests/one.test.ts', 'tests/two.test.ts')).toBe(false)
  })
})

// The shape of vitest.config.ts: two projects, each with its own lists, and calls like
// resolve('./src/shared') in between that must not be mistaken for an entry.
const CONFIG = `
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: [
            'tests/a.test.ts',
            'tests/b.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/a.test.ts',
            'tests/b.test.ts',
          ],
        },
      },
    ],
  },
`

describe('reading the runner config', () => {
  it('keeps each project with its own lists', () => {
    const projects = parseRunnerProjects(CONFIG)
    expect(projects.map((project) => project.name)).toEqual(['jsdom', 'node'])
    expect(projects[0]!.include).toEqual(['src/**/*.test.ts', 'tests/**/*.test.ts'])
    expect(projects[0]!.exclude).toEqual(['tests/a.test.ts', 'tests/b.test.ts'])
    expect(projects[1]!.exclude).toEqual([])
  })

  it('finds the node project by name rather than by position', () => {
    const reversed = CONFIG.replace(/name: 'jsdom'/, "name: 'node'").replace(/name: 'node',\n          environment/, "name: 'jsdom',\n          environment")
    const [first] = parseRunnerProjects(reversed)
    expect(nodeInclude([first!, { name: 'node', include: ['tests/a.test.ts'], exclude: [] }]))
      .toEqual(['tests/a.test.ts'])
  })

  it('does not close a list early on a bracket inside a quoted entry', () => {
    const projects = parseRunnerProjects(`
      test: { projects: [ { test: { name: 'jsdom', include: ['src/**/[id].test.ts'], exclude: [] } },
      { test: { name: 'node', include: [], exclude: [] } } ] }
    `)
    expect(projects[0]!.include).toEqual(['src/**/[id].test.ts'])
  })
})

// jsdom excludes `a` and the node project lists nothing, so `a` is selected by no project at
// all while `b` — glob-matched by jsdom and listed nowhere — is the file a config taking the
// other side's list would send to the wrong environment.
const CONFIG_MISSING_FROM_NODE = `
  test: {
    projects: [
      {
        test: {
          name: 'jsdom',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: ['tests/a.test.ts'],
        },
      },
      { test: { name: 'node', include: [] } },
    ],
  },
`

const CONFIG_SELECTED_TWICE = `
  test: {
    projects: [
      { test: { name: 'jsdom', include: ['tests/**/*.test.ts'], exclude: [] } },
      { test: { name: 'node', include: ['tests/a.test.ts'] } },
    ],
  },
`

describe('which project would run a test file', () => {
  it('reports a file excluded from jsdom and left out of the node list as run by nothing', () => {
    const projects = parseRunnerProjects(CONFIG_MISSING_FROM_NODE)
    expect(unselectedTests(projects, ['tests/a.test.ts', 'tests/b.test.ts']).neverRuns)
      .toEqual(['tests/a.test.ts'])
  })

  it('reports a file both projects would pick up', () => {
    const projects = parseRunnerProjects(CONFIG_SELECTED_TWICE)
    expect(unselectedTests(projects, ['tests/a.test.ts']).runTwice).toEqual(['tests/a.test.ts'])
  })

  // The trap behind the guard this script exists for: a test file one side's config handed to
  // the node project, which the other side's list would send back to jsdom.
  it('reports a node-owned file that a config would hand back to jsdom', () => {
    const projects = parseRunnerProjects(CONFIG_MISSING_FROM_NODE)
    expect(environmentIssues(projects, ['tests/b.test.ts']))
      .toEqual(['tests/b.test.ts: runs under jsdom although a node project owned it'])
  })

  it('collects every way a config can misplace a test file', () => {
    const projects = parseRunnerProjects(CONFIG_MISSING_FROM_NODE)
    expect(runnerIssues(projects, ['tests/a.test.ts', 'tests/b.test.ts'], ['tests/a.test.ts', 'tests/b.test.ts']))
      .toEqual([
        'tests/a.test.ts: selected by no project',
        'tests/b.test.ts: runs under jsdom although a node project owned it',
      ])
  })
})

// `--in-progress` reads the merge result off disk instead of out of two branches, which is the
// difference between advising a resolution and judging one: the config and the test files it has
// to cover are both the working tree's at that point.
describe('reading the merge result off disk', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  function fixture(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-preflight-'))
    roots.push(root)
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
      fs.writeFileSync(path.join(root, name), content)
    }
    return root
  }

  const CONFIG_FILE = `
    test: { projects: [
      { test: { name: 'jsdom', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], exclude: ['tests/a.test.ts'] } },
      { test: { name: 'node', include: ['tests/a.test.ts'] } },
    ] },
  `

  it('reads the config and the test files from the tree it is given', () => {
    const root = fixture({
      'vitest.config.ts': CONFIG_FILE,
      'tests/a.test.ts': '// a\n',
      'src/client/b.test.ts': '// b\n',
      'src/client/b.ts': '// not a test\n',
    })
    const snapshot = readRunnerSnapshot(root)
    expect(snapshot.tests).toEqual(['src/client/b.test.ts', 'tests/a.test.ts'])
    expect(runnerIssues(snapshot.projects, snapshot.tests, ['tests/a.test.ts'])).toEqual([])
  })

  it('names the test a resolution left with no project', () => {
    const root = fixture({ 'vitest.config.ts': CONFIG_FILE.replace("include: ['tests/a.test.ts']", 'include: []') })
    const snapshot = readRunnerSnapshot(root)
    expect(runnerIssues(snapshot.projects, ['tests/a.test.ts'], ['tests/a.test.ts']))
      .toEqual(['tests/a.test.ts: selected by no project'])
  })

  it('survives a tree without the runner config rather than throwing', () => {
    const root = fixture({ 'tests/a.test.ts': '// a\n' })
    expect(readRunnerSnapshot(root)).toEqual({ projects: [], tests: ['tests/a.test.ts'] })
  })
})

describe('what refuses a merge commit', () => {
  it('blocks on a staged conflict marker', () => {
    expect(mergeBlockers({ markers: ['src/worker/app.ts'], runner: { issues: [] }, lostAdditions: [] }))
      .toEqual(['src/worker/app.ts: a conflict marker is still in the staged content'])
  })

  it('blocks on every runner finding', () => {
    const blockers = mergeBlockers({
      markers: [],
      runner: { issues: ['tests/a.test.ts: selected by no project'] },
      lostAdditions: [],
    })
    expect(blockers).toEqual(['tests/a.test.ts: selected by no project'])
  })

  it('blocks an added test file the resolution dropped', () => {
    expect(mergeBlockers({ markers: [], runner: { issues: [] }, lostAdditions: ['tests/new.test.ts'] }))
      .toEqual(['tests/new.test.ts: added on one side of this merge but absent from the result'])
  })

  // Branch bookkeeping is per branch by nature, so it is reported without being enforced.
  it('does not enforce a dropped addition outside the code and test trees', () => {
    expect(mergeBlockers({ markers: [], runner: { issues: [] }, lostAdditions: ['.qoder/improvement/plan.md'] }))
      .toEqual([])
  })
})

// The invariant the merge above broke, as a standing guard: whichever project owns a test file,
// the other one must not be the only one that selects it, and nothing may select it twice. A
// file in the jsdom exclude list that is missing from the node include list used to mean the
// suite quietly ran fewer tests than the tree contained.
describe('this repository runs every test file exactly once', () => {
  it('selects each test file in src and tests with exactly one project', () => {
    const projects = parseRunnerProjects(fs.readFileSync('vitest.config.ts', 'utf8'))
    expect(projects.map((project) => project.name)).toEqual(['jsdom', 'node'])
    const files = fs.readdirSync('.', { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.test\.tsx?$/.test(file) && !file.includes('node_modules'))
      .filter((file) => file.startsWith('src/') || file.startsWith('tests/'))
    expect(files.length).toBeGreaterThan(100)
    const { neverRuns, runTwice } = unselectedTests(projects, files)
    expect(neverRuns).toEqual([])
    expect(runTwice).toEqual([])
  })
})
