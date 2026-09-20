import { execFileSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'
import { crossingFacts } from '../scripts/merge-crossings.mjs'
import { crossingGroups, describeCrossing } from '../scripts/merge-preflight-analysis.mjs'

// The merge this tool was written for, pinned by commit rather than rebuilt. The two sides are
// ordinary commits of this repository — a 115-commit branch (`ours`) merged into `dev` (`theirs`) —
// and what the detector must keep saying about them is recorded below as the exact group texts.
//
// It is here because the detector is the only thing standing between a merge and the edits that
// compile into it silently: a regex or a resolution rule that stops matching still exits 0, and
// nothing else in the suite would notice. A smaller report therefore fails, and so does a larger
// one — a new finding has to be read and re-pinned deliberately, which is the same reason the
// expectations are the report's own wording: the wording is what a human acts on.
//
// To re-pin after reading a diff of the report: `node scripts/check-merge-preflight.mjs 022aaf46
// 9351a982` prints the same list (branch mode and the hook's in-progress mode agree — both call
// crossingFacts, and this replay is why that function takes two revisions and nothing else).
//
// Replaying reads the two revisions and their base, so it writes nothing: no merge, no tree object,
// no index entry. In a shallow clone (CI checks out one commit) the material is absent and the
// replay skips — the clone is asked why, and a complete clone that has lost the commits fails
// instead, because that is a broken pin rather than an absent one.
const PINNED = {
  ours: '9351a9823d11d1ca2851620c83326dc6a825f46e',
  theirs: '022aaf46e300d18185b716aecd94bff15efa7b4a',
  base: '53824e3cc3be97a2034e034b5e22b458cb3eb8eb',
}
const SHARED_FILES = 33
const CROSSING_COUNT = 51
const GROUPS = [
  'src/client/features/music/music-hub-sidebar.tsx: the other side still imports 2 declarations (formatBytes, formatTotalDuration) from src/client/features/music/music-utils.ts, which this side stopped exporting',
  'src/client/features/share/share-dashboard-view.tsx: the other side moved TimelineCard into src/client/features/share/share-dashboard-timeline-card.tsx while this side edited the file in place',
  'src/client/store/session.ts: this side still imports 4 declarations (DEFAULT_SETTINGS, assertUnchangedSettingsSections, mergeSettings +1 more) from src/shared/constants.ts, which the other side moved into src/shared/user-settings.ts',
  'src/shared/constants.ts: the other side moved 36 declarations (ACCENT_NAMES, BACKGROUND_NAMES, BACKUP_SCHEDULES +33 more) into src/shared/user-settings.ts while this side edited the file in place',
  'src/worker/app.ts: this side moved 5 declarations (applyScriptNonce, authorizationFormAction, randomNonce +2 more) into src/worker/middleware/security-headers.ts while the other side edited the file in place',
  'src/worker/middleware/security-headers.ts: this side still imports mergeSettings from src/shared/constants.ts, which the other side moved into src/shared/user-settings.ts',
  'src/worker/routes/music/webdav.ts: the other side still imports isAudioEntry from src/worker/routes/music/webdav-xml.ts, which this side stopped exporting',
  'src/worker/routes/music/webdav.ts: this side still imports mergeSettings from src/shared/constants.ts, which the other side moved into src/shared/user-settings.ts',
]

function hasCommit(revision: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${revision}^{commit}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const material = hasCommit(PINNED.ours) && hasCommit(PINNED.theirs)
const shallow = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true'
  } catch {
    return false
  }
})()

if (!material) {
  console.warn(`[merge-preflight] the pinned merge is not in this clone (shallow: ${shallow}), so its crossings cannot be replayed here`)
}

it.runIf(!material)('explains why the pinned merge cannot be replayed', () => {
  expect(shallow, 'a complete clone that lost these commits is a broken pin, not an absent one').toBe(true)
})

describe.skipIf(!material)('merge preflight: the real merge, replayed and pinned', () => {
  let facts: ReturnType<typeof crossingFacts>

  beforeAll(() => {
    facts = crossingFacts({ ours: PINNED.ours, theirs: PINNED.theirs })
  })

  it('reads the base the pin names, not whatever the two sides share today', () => {
    expect(facts.base).toBe(PINNED.base)
  })

  it('still finds the 33 files both sides changed', () => {
    expect(facts.shared).toHaveLength(SHARED_FILES)
  })

  it('reports every crossing it reported then, grouped the same way', () => {
    expect(facts.crossings).toHaveLength(CROSSING_COUNT)
    expect(crossingGroups(facts.crossings)).toHaveLength(GROUPS.length)
  })

  it('says the same things about them, word for word', () => {
    expect(crossingGroups(facts.crossings).map(describeCrossing)).toEqual(GROUPS)
  })
})
