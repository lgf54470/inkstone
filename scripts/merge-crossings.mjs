// The crossings between two revisions: which of each side's edits land on a name the other side
// moved or dropped, read from the two revisions and their base alone — no working tree, no index,
// no resolution. That is what lets the same judgment answer before the merge (branch mode), while a
// merge is being recorded (in-progress mode), and for a merge out of history: the regression test
// replays the two sides of the one this was written for and pins what it must keep saying.
import {
  addedDeclarations,
  declaredNames,
  moduleAliases,
  moveCrossings,
  relocationCrossings,
  resolvedImports,
} from './merge-preflight-analysis.mjs'
import { TS_CONFIG_PATH, git, gitOrEmpty, lines, readBlobs, readConfig } from './merge-git.mjs'
import { reshapedNames, shapeCrossings } from './merge-shapes.mjs'

export function crossingFacts({ ours, theirs, root = process.cwd() }) {
  const base = git(['merge-base', ours, theirs])
  const revisions = { base, ours, theirs }
  const addedBy = (side) => lines(gitOrEmpty(['diff', '--name-only', '--diff-filter=A', base, side]))
  const changedBy = (side) => new Set(lines(gitOrEmpty(['diff', '--name-only', base, side])))
  const touchedBy = (side) => [...changedBy(side), ...addedBy(side)]
  const touched = { ours: new Set(touchedBy(ours)), theirs: new Set(touchedBy(theirs)) }
  const theirsChanged = changedBy(theirs)
  const shared = lines(gitOrEmpty(['diff', '--name-only', base, ours]))
    .filter((file) => theirsChanged.has(file))
    .sort()
  // Which paths each side actually has. A specifier resolves to candidates in the order TypeScript
  // would try them, and most of them do not exist: without this list every candidate costs a `git
  // show` that fails, which measured at twenty-five seconds on one real merge instead of two.
  const present = {
    base: new Set(lines(gitOrEmpty(['ls-tree', '-r', '--name-only', base]))),
    ours: new Set(lines(gitOrEmpty(['ls-tree', '-r', '--name-only', ours]))),
    theirs: new Set(lines(gitOrEmpty(['ls-tree', '-r', '--name-only', theirs]))),
  }
  // A path one side deleted or renamed away is not in that side's revision, and `git show` fails
  // with 128 rather than saying so: an absent file has no declarations and no imports, which is the
  // answer every caller wants. Measured on the real merge this was written for, whose sides deleted
  // paths that the other side still had. What the detectors ask for most — both sides' touched files
  // and both versions of every file they changed — is read in three batches up front, so a spawn is
  // paid only for what the batches did not cover.
  const texts = new Map()
  const key = (side, file) => `${side}\u0000${file}`
  const remember = (side, blobs) => {
    for (const [file, text] of blobs) texts.set(key(side, file), text)
  }
  remember('ours', readBlobs(ours, touchedBy(ours)))
  remember('theirs', readBlobs(theirs, touchedBy(theirs)))
  remember('base', readBlobs(base, [...new Set([...changedBy(ours), ...changedBy(theirs)])]))
  const readText = (side, file) => {
    if (!texts.has(key(side, file))) {
      const absent = present[side].has(file) ? null : ''
      texts.set(key(side, file), absent ?? gitOrEmpty(['show', `${revisions[side]}:${file}`], [128]))
    }
    return texts.get(key(side, file))
  }
  const movedInto = {
    ours: addedDeclarations({ files: addedBy(ours), readText: (file) => readText('ours', file) }),
    theirs: addedDeclarations({ files: addedBy(theirs), readText: (file) => readText('theirs', file) }),
  }
  const aliases = moduleAliases(TS_CONFIG_PATH.map((file) => readConfig(root, file)))
  // What the merge would leave a module as: a file only one side touched is that side's version, and
  // a file both touched has no decided version until a human resolves it — which the conflict list
  // already points at — so the barrel walk stops there rather than guessing. Cached because the walk
  // revisits barrels.
  const mergedModules = new Map()
  const readMerged = (file) => {
    if (mergedModules.has(file)) return mergedModules.get(file)
    const touchedByOurs = touched.ours.has(file)
    const touchedByTheirs = touched.theirs.has(file)
    const side = touchedByOurs === touchedByTheirs ? (touchedByOurs ? null : 'base') : (touchedByOurs ? 'ours' : 'theirs')
    const text = side && present[side].has(file) ? readText(side, file) || null : null
    mergedModules.set(file, text)
    return text
  }
  // What each side's own files read, read once: the relocation detector wants every one of them, and
  // the shape detector wants the same list to know which names are in play at all.
  const reads = {
    ours: resolvedImports({ files: touchedBy(ours), readText: (file) => readText('ours', file), aliases }),
    theirs: resolvedImports({ files: touchedBy(theirs), readText: (file) => readText('theirs', file), aliases }),
  }
  // Both directions: either side can be the one holding an import of a name the other moved away.
  const relocations = [
    ...relocationCrossings({
      droppedBy: 'theirs',
      readText,
      aliases,
      readModule: readMerged,
      changedByOther: touched.theirs,
      imports: reads.ours,
      movedInto: movedInto.theirs,
    }),
    ...relocationCrossings({
      droppedBy: 'ours',
      readText,
      aliases,
      readModule: readMerged,
      changedByOther: touched.ours,
      imports: reads.theirs,
      movedInto: movedInto.ours,
    }),
  ]
  const crossings = [...moveCrossings({ shared, readText, movedInto }), ...relocations]
    .sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
  // The compiler-backed pass is last and narrowest: it only sees names one side's files read and the
  // other side declares, so most merges never load the compiler at all.
  const shapes = [
    ...shapeCrossings({
      reshaped: reshapedNames({
        files: touched.ours,
        shaper: 'ours',
        other: 'theirs',
        readText,
        declaredNames,
        namesOfInterest: new Set(reads.theirs.map((entry) => entry.name)),
      }),
      reads: reads.theirs.map((entry) => ({ ...entry, side: 'theirs' })),
    }),
    ...shapeCrossings({
      reshaped: reshapedNames({
        files: touched.theirs,
        shaper: 'theirs',
        other: 'ours',
        readText,
        declaredNames,
        namesOfInterest: new Set(reads.ours.map((entry) => entry.name)),
      }),
      reads: reads.ours.map((entry) => ({ ...entry, side: 'ours' })),
    }),
  ].sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
  return { base, shared, crossings, shapes, addedBy, changedBy, touchedBy, readText }
}
