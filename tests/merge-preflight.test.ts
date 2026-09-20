import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// The pieces that decide come from the analysis module; the ones that read git or run a command
// come from the script, which is also what the hook invokes.
import {
  mergeBlockers,
  mergeVerificationSteps,
  mergedHead,
  readRunnerSnapshot,
  runMergeVerification,
} from '../scripts/check-merge-preflight.mjs'
import {
  addedDeclarations,
  classifyChanges,
  crossingGroups,
  declaredNames,
  deletionHazards,
  describeCrossing,
  droppedNamesIn,
  environmentIssues,
  importBindings,
  matchesPattern,
  mergeVerificationPlan,
  moduleAliases,
  moduleCandidates,
  moveCrossings,
  nodeInclude,
  parseMergeTreeOutput,
  parseRunnerProjects,
  relocationCrossings,
  resolvedImports,
  runnerIssues,
  singleSideFiles,
  unselectedTests,
} from '../scripts/merge-preflight-analysis.mjs'

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

// The declaration one side takes out of a file the other side is editing. Export-only would see
// nothing here, and that is the point: the merge this comes from moved a *private* function out of
// app.ts, so no export list changed while the file lost the declaration.
describe('top-level declarations in a file', () => {
  it('collects them whether or not they are exported', () => {
    const names = declaredNames(`
export async function createApp(): Promise<void> {}
function helper(): void {}
export interface Extras {}
type Local = string
class Registry {}
export const LIMIT = 3
`)
    expect([...names].sort()).toEqual(['Extras', 'LIMIT', 'Local', 'Registry', 'createApp', 'helper'])
  })

  it('ignores declarations nested inside a function or a block', () => {
    expect([...declaredNames(`
export function outer(): void {
  const inner = 1
  function nested(): void {}
}
`)]).toEqual(['outer'])
  })
})

const BASE_APP = `import { OTHER } from './shared/constants'

function helper(app: { use: () => void }): void {
  app.use()
}

export function createApp(): string {
  return 'app'
}
`

const OURS_APP = `import { OTHER } from './shared/constants'
import { helper } from './helper-module'

export function createApp(): string {
  return 'app'
}
`

const HELPER_MODULE = `export function helper(app: { use: () => void }): void {
  app.use()
}
`

const THEIRS_APP = `${BASE_APP}\nexport function footer(): string {
  return 'footer'
}
`

describe('a declaration that left a file the other side was editing', () => {
  const readApp = (side: 'base' | 'ours' | 'theirs') => ({ base: BASE_APP, ours: OURS_APP, theirs: THEIRS_APP })[side]

  it('names the file it left and the file it landed in', () => {
    const crossings = moveCrossings({
      shared: ['src/app.ts'],
      readText: (side, file) => (file === 'src/app.ts' ? readApp(side) : ''),
      movedInto: {
        ours: addedDeclarations({ files: ['src/helper-module.ts'], readText: () => HELPER_MODULE }),
        theirs: new Map(),
      },
    })
    expect(crossings).toHaveLength(1)
    expect(crossings[0]).toMatchObject({
      file: 'src/app.ts',
      name: 'helper',
      side: 'ours',
      into: 'src/helper-module.ts',
    })
    expect(describeCrossing(crossings[0]!)).toBe(
      'src/app.ts: this side moved helper into src/helper-module.ts while the other side edited the file in place',
    )
  })

  it('reports a removal with no destination when the other side still declares the name', () => {
    const crossings = moveCrossings({
      shared: ['src/app.ts'],
      readText: (side, file) => (file === 'src/app.ts' ? readApp(side) : ''),
      movedInto: { ours: new Map(), theirs: new Map() },
    })
    expect(crossings.map((entry) => entry.name)).toEqual(['helper'])
    expect(describeCrossing(crossings[0]!)).toBe(
      'src/app.ts: this side removed helper, which the other side still declares in the file both sides changed',
    )
  })

  // A name both sides removed is a rename or a deletion they agreed on, not a collision.
  it('stays quiet when neither side kept the name', () => {
    const crossings = moveCrossings({
      shared: ['src/app.ts'],
      readText: (side) => (side === 'base' ? BASE_APP : OURS_APP),
      movedInto: { ours: new Map(), theirs: new Map() },
    })
    expect(crossings).toEqual([])
  })

  it('looks at TypeScript files only', () => {
    const crossings = moveCrossings({
      shared: ['src/styles/tokens.css'],
      readText: () => BASE_APP,
      movedInto: { ours: new Map(), theirs: new Map() },
    })
    expect(crossings).toEqual([])
  })
})

describe('reading the imports out of a file', () => {
  it('takes the names the module has to export, not the local ones', () => {
    expect(importBindings(`import { a, b as c } from './x'
import Default from './y'
`)).toEqual([
      { name: 'a', from: './x' },
      { name: 'b', from: './x' },
      { name: 'Default', from: './y' },
    ])
  })

  // A fifth of this repository's imports are written across lines; a line-based reader would drop
  // them without saying so.
  it('reads an import that spans lines', () => {
    expect(importBindings(`import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  mergeSettings,
} from '@shared/constants'
`)).toEqual([
      { name: 'LEGACY_SESSION_COOKIE', from: '@shared/constants' },
      { name: 'SESSION_COOKIE', from: '@shared/constants' },
      { name: 'mergeSettings', from: '@shared/constants' },
    ])
  })

  it('counts a re-export as an import of the same name', () => {
    expect(importBindings(`export { MAX, MIN as LOW } from './limits'
`)).toEqual([
      { name: 'MAX', from: './limits' },
      { name: 'MIN', from: './limits' },
    ])
  })

  it('skips the clauses that name no export', () => {
    expect(importBindings(`import './side-effect'
import * as ns from './all'
import type { OnlyTypes } from './types'
`)).toEqual([{ name: 'OnlyTypes', from: './types' }])
  })
})

// The alias table the resolver needs, as the tsconfig files write it.
const TS_CONFIG = `
  {
    "compilerOptions": {
      "paths": {
        "@/*": ["./src/client/*"],
        "@shared/*": ["./src/shared/*"]
      }
    },
    "include": ["src/client/**/*", "src/shared/**/*", "package.json"]
  }
`

describe('resolving a specifier to the files it could name', () => {
  const aliases = moduleAliases([TS_CONFIG])

  it('reads the alias table and not the include globs', () => {
    expect([...aliases]).toEqual([['@/', 'src/client/'], ['@shared/', 'src/shared/']])
  })

  it('tries the extensions and the index files TypeScript would', () => {
    expect(moduleCandidates({ specifier: '@shared/constants', fromFile: 'src/worker/app.ts', aliases }))
      .toEqual([
        'src/shared/constants',
        'src/shared/constants.ts',
        'src/shared/constants.tsx',
        'src/shared/constants/index.ts',
        'src/shared/constants/index.tsx',
      ])
  })

  it('resolves a relative path against the file that imports it', () => {
    expect(moduleCandidates({ specifier: '../../shared/user-settings', fromFile: 'src/worker/middleware/security-headers.ts', aliases }))
      .toContain('src/shared/user-settings.ts')
  })

  it('has no answer for a bare package name', () => {
    expect(moduleCandidates({ specifier: 'hono', fromFile: 'src/worker/app.ts', aliases })).toEqual([])
  })
})

// The hazard this half of the detector exists for: one side moves a name out of a module, the other
// side's files keep importing it from there, and the two edits are in different files, so git has
// nothing to conflict about. On the real merge the pair was security-headers.ts and constants.ts.
describe('a name that moved between modules', () => {
  const BASE_CONSTANTS = `export const OTHER = 1
export const mergeSettings = (raw: string): string => raw.trim()
`
  const THEIRS_CONSTANTS = `export const OTHER = 1
`
  const IMPORTER = `import { OTHER } from '@shared/constants'
import { mergeSettings } from '@shared/constants'

export const settings = (raw: string): string => mergeSettings(raw) + OTHER
`
  const aliases = moduleAliases([TS_CONFIG])
  const readText = (side: string) => (side === 'base' ? BASE_CONSTANTS : THEIRS_CONSTANTS)
  const imports = resolvedImports({ files: ['src/worker/middleware/security-headers.ts'], readText: () => IMPORTER, aliases })
  const movedInto = new Map([['mergeSettings', 'src/shared/user-settings.ts']])

  it('reports the import that points at the module the other side emptied', () => {
    const crossings = relocationCrossings({
      droppedBy: 'theirs',
      imports,
      changedByOther: new Set(['src/shared/constants.ts']),
      readText,
      movedInto,
    })
    expect(crossings).toHaveLength(1)
    expect(crossings[0]).toMatchObject({
      kind: 'relocated',
      file: 'src/worker/middleware/security-headers.ts',
      name: 'mergeSettings',
      side: 'ours',
      from: 'src/shared/constants.ts',
      into: 'src/shared/user-settings.ts',
    })
    expect(describeCrossing(crossings[0]!)).toBe(
      'src/worker/middleware/security-headers.ts: this side still imports mergeSettings from src/shared/constants.ts, which the other side moved into src/shared/user-settings.ts',
    )
  })

  it('stays quiet when the other side did not touch that module', () => {
    expect(relocationCrossings({
      droppedBy: 'theirs',
      imports,
      changedByOther: new Set(['src/shared/other.ts']),
      readText,
      movedInto,
    })).toEqual([])
  })

  it('stays quiet while the name is still exported', () => {
    expect(relocationCrossings({
      droppedBy: 'theirs',
      imports,
      changedByOther: new Set(['src/shared/constants.ts']),
      readText: () => BASE_CONSTANTS,
      movedInto,
    })).toEqual([])
  })

  it('reads the dropped names of one file against the base version', () => {
    expect([...droppedNamesIn({ file: 'src/shared/constants.ts', side: 'theirs', readText })])
      .toEqual(['mergeSettings'])
  })

  // A module-wide move makes one crossing per name; printing them all is how a gate stops being read.
  it('groups the crossings that differ only in the name', () => {
    const many = Array.from({ length: 36 }, (_, index) => ({
      kind: 'moved',
      file: 'src/shared/constants.ts',
      name: `MOVE_${String(index).padStart(2, '0')}`,
      side: 'theirs',
      into: 'src/shared/user-settings.ts',
    }))
    const groups = crossingGroups([...many, { kind: 'moved', file: 'src/shared/constants.ts', name: 'OTHER', side: 'theirs', into: 'src/other.ts' }])
    expect(groups).toHaveLength(2)
    expect(groups[0]!.names).toHaveLength(36)
    expect(describeCrossing(groups[0]!)).toBe(
      'src/shared/constants.ts: the other side moved 36 declarations (MOVE_00, MOVE_01, MOVE_02 +33 more) into src/shared/user-settings.ts while this side edited the file in place',
    )
    expect(describeCrossing(groups[1]!)).toBe(
      'src/shared/constants.ts: the other side moved OTHER into src/other.ts while this side edited the file in place',
    )
  })
})

describe('what a merge commit owes before it is written', () => {
  const crossing = { file: 'src/app.ts', name: 'helper', side: 'ours' as const, into: 'src/helper-module.ts' }

  it('asks for the compile whenever the merge brings in TypeScript', () => {
    expect(mergeVerificationPlan({ stagedTs: ['src/app.ts'], crossings: [] }))
      .toEqual({ typecheck: true, smokeFiles: [] })
  })

  it('adds the files a crossing passed through to the smoke group, once each', () => {
    expect(mergeVerificationPlan({ stagedTs: ['src/app.ts'], crossings: [crossing, crossing] }))
      .toEqual({ typecheck: true, smokeFiles: ['src/app.ts', 'src/helper-module.ts'] })
  })

  it('owes nothing for a merge that brings in no TypeScript and re-arranged no file', () => {
    expect(mergeVerificationPlan({ stagedTs: [], crossings: [] }))
      .toEqual({ typecheck: false, smokeFiles: [] })
  })

  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  function fixture(files: string[]): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-verify-'))
    roots.push(root)
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), '')
    }
    return root
  }

  it('runs the compile first and the related tests over the crossing files', () => {
    const root = fixture(['src/app.ts', 'src/helper-module.ts'])
    const plan = mergeVerificationPlan({ stagedTs: ['src/app.ts'], crossings: [crossing] })
    const steps = mergeVerificationSteps({ plan, root })
    expect(steps.map((step) => step.command)).toEqual(['npm', 'npx'])
    expect(steps[0]!.args).toEqual(['run', 'typecheck', '--silent'])
    expect(steps[1]!.args).toContain('src/helper-module.ts')
  })

  // A destination the resolution deleted is not a file the runner can be pointed at.
  it('drops a smoke file that is not on disk', () => {
    const root = fixture(['src/app.ts'])
    const plan = mergeVerificationPlan({ stagedTs: ['src/app.ts'], crossings: [crossing] })
    const steps = mergeVerificationSteps({ plan, root })
    expect(steps).toHaveLength(2)
    expect(steps[1]!.args).not.toContain('src/helper-module.ts')
  })

  it('collects the failing step together with the output that explains it', () => {
    const root = fixture(['src/app.ts', 'src/helper-module.ts'])
    const plan = mergeVerificationPlan({ stagedTs: ['src/app.ts'], crossings: [crossing] })
    const called: string[] = []
    const { failures } = runMergeVerification({
      plan,
      root,
      log: () => {},
      run: ({ command, args }) => {
        called.push([command, ...args].join(' '))
        return { status: 1, output: "error TS2305: Module has no exported member 'mergeSettings'." }
      },
    })
    expect(failures).toHaveLength(1)
    expect(failures[0]!.label).toBe('typecheck')
    expect(failures[0]!.output).toMatch(/TS2305/)
    // The second step is not worth waiting for once the result is known to be broken.
    expect(called).toHaveLength(1)
  })

  it('runs both steps and reports nothing when they pass', () => {
    const root = fixture(['src/app.ts', 'src/helper-module.ts'])
    const plan = mergeVerificationPlan({ stagedTs: ['src/app.ts'], crossings: [crossing] })
    const called: string[] = []
    const { failures } = runMergeVerification({
      plan,
      root,
      log: () => {},
      run: ({ command, args }) => {
        called.push([command, ...args].join(' '))
        return { status: 0, output: '' }
      },
    })
    expect(failures).toEqual([])
    expect(called).toEqual([
      'npm run typecheck --silent',
      'npx --no-install vitest related --run src/app.ts src/helper-module.ts --passWithNoTests --testTimeout=30000',
    ])
  })
})

// The head being merged, which git does not leave in MERGE_HEAD while it is making the merge
// commit itself. Reading only that file made the gate pass in silence for a clean merge — which
// is what the first run of the end-to-end fixture did, and why the relay exists.
describe('finding the head being merged', () => {
  it('falls back to the head git relays when MERGE_HEAD is not there', () => {
    const sha = 'a'.repeat(40)
    expect(mergedHead({ [`GITHEAD_${sha}`]: 'dev' }))
      .toEqual({ revision: sha, from: `GITHEAD_${sha}=dev` })
  })

  it('ignores a relay that is not an object id', () => {
    expect(mergedHead({ GITHEAD_short: 'dev' })).toBeNull()
  })

  it('finds nothing in a tree where no merge is being recorded', () => {
    expect(mergedHead({})).toBeNull()
  })
})

// The gate only works if the hook git runs for a merge asks for it: `git merge` invokes
// pre-merge-commit *instead of* pre-commit, so a hook that stops at the findings leaves the
// compile and the tests unasked (measured: with no pre-merge-commit in place, no hook runs at all).
describe('the hook git runs for a merge', () => {
  it('asks for the verification and not only the findings', () => {
    expect(fs.readFileSync('.githooks/pre-merge-commit', 'utf8'))
      .toMatch(/check-merge-preflight\.mjs --in-progress --verify/)
  })
})

// Reached through a symlink — how a hook or a scratch fixture installs it — the script has to run.
// It did not, and said nothing: node resolves a symlinked entry point to its real path in
// import.meta.url but leaves argv[1] as the symlink, so the "am I the main module" comparison was
// false and the whole gate exited 0 in silence. That is the failure mode this file is about.
describe('running the script as a program', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('still runs when it is reached through a symlink', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-preflight-link-'))
    roots.push(dir)
    const link = path.join(dir, 'check-merge-preflight.mjs')
    fs.symlinkSync(path.resolve('scripts/check-merge-preflight.mjs'), link)
    const output = execFileSync(process.execPath, [link, '--in-progress'], { encoding: 'utf8' })
    expect(output).toMatch(/no merge is being recorded|merge in progress/)
  })
})
