import { describe, expect, it } from 'vitest'
import {
  SHARE_CATEGORY_STATUS,
  SHARE_STATUS_FILTERS,
  expiringSoonCutoff,
  isShareStatusFilter,
  resolveShareTarget,
  shareCategoryStatus,
  shareMatchesSelection,
  shareMatchesStatus,
  shareMatchesTarget,
  visitMatchesTraffic,
  type ShareSelectionSubject,
} from './share-selection'

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

function subject(fields: Partial<ShareSelectionSubject> = {}): ShareSelectionSubject {
  return { isEnabled: true, expiresAt: null, hasPassword: false, ...fields }
}

describe('share status vocabulary', () => {
  it('accepts exactly the statuses the toolbar lists', () => {
    for (const status of SHARE_STATUS_FILTERS) expect(isShareStatusFilter(status)).toBe(true)
    // The categories that are views rather than filters, and a value that differs only in case, must
    // not reach a query: a status the worker quietly ignored would look like a filter that does nothing.
    for (const value of ['dashboard', 'collections', 'ALL', 'bogus', '', null, 3, undefined]) {
      expect([value, isShareStatusFilter(value)]).toEqual([value, false])
    }
    expect(new Set(SHARE_STATUS_FILTERS).size).toBe(SHARE_STATUS_FILTERS.length)
  })

  it('covers every status category with a status from that vocabulary', () => {
    for (const [category, status] of Object.entries(SHARE_CATEGORY_STATUS)) {
      expect([category, SHARE_STATUS_FILTERS.includes(status)]).toEqual([category, true])
    }
    expect(shareCategoryStatus('dashboard')).toBe('all')
    expect(shareCategoryStatus('collections')).toBe('all')
  })
})

describe('resolving a target record to what a share stores', () => {
  it('keeps a folder id and converts a tag id to the tag name', () => {
    // The asymmetry is the rule: `shares.folder_id` holds an id, `shares.tags` holds names. A tag
    // collection that matched its id against those names is the bug this conversion exists to make
    // unrepresentable.
    expect(resolveShareTarget({ type: 'folder', value: 'f-1' }, null)).toEqual({ type: 'folder', value: 'f-1' })
    expect(resolveShareTarget({ type: 'tag', value: 't-1' }, 'Research')).toEqual({ type: 'tag', value: 'Research' })
  })

  it('covers nothing when the target record is gone', () => {
    // A tag collection whose tag was deleted points at an address nobody can resolve; the page is
    // empty, which is a value, not an error to answer with.
    expect(resolveShareTarget({ type: 'tag', value: 't-1' }, null)).toEqual({ type: 'none' })
  })
})

describe('matching a share against a resolved target', () => {
  it('matches a tag as a whole element, never as a substring of the stored array', () => {
    expect(shareMatchesTarget(subject({ tags: ['Research'] }), { type: 'tag', value: 'Research' })).toBe(true)
    expect(shareMatchesTarget(subject({ tags: ['Research', 'Other'] }), { type: 'tag', value: 'Other' })).toBe(true)
    for (const tags of [['Research papers'], ['Research2'], ['Pre-Research'], []]) {
      expect([tags, shareMatchesTarget(subject({ tags }), { type: 'tag', value: 'Research' })]).toEqual([tags, false])
    }
  })

  it('matches a folder by its stored id, and treats a missing array as empty', () => {
    expect(shareMatchesTarget(subject({ folderId: 'f-1' }), { type: 'folder', value: 'f-1' })).toBe(true)
    expect(shareMatchesTarget(subject({ folderId: null }), { type: 'folder', value: 'f-1' })).toBe(false)
    expect(shareMatchesTarget(subject(), { type: 'tag', value: 'Research' })).toBe(false)
    expect(shareMatchesTarget(subject({ folderId: 'f-1', tags: ['Research'] }), null)).toBe(true)
    expect(shareMatchesTarget(subject({ folderId: 'f-1', tags: ['Research'] }), { type: 'none' })).toBe(false)
  })
})

describe('the status rules', () => {
  it('reads the clock the same way at every boundary', () => {
    // Exactly now is expired, not expiring: the SQL compares `<=`/`>` and the predicate has to agree
    // about which side of the instant a share falls on, or a row flips between the panel and the query.
    const at = subject({ expiresAt: NOW })
    expect(shareMatchesStatus(at, 'expired', NOW)).toBe(true)
    expect(shareMatchesStatus(at, 'expiring', NOW)).toBe(false)
    expect(shareMatchesStatus(at, 'expiring_soon', NOW)).toBe(false)
    expect(shareMatchesStatus(at, 'active', NOW)).toBe(false)
    expect(shareMatchesStatus(at, 'permanent', NOW)).toBe(false)

    const cutoff = expiringSoonCutoff(NOW)
    expect(expiringSoonCutoff(NOW)).toBe(NOW + 7 * DAY)
    expect(shareMatchesStatus(subject({ expiresAt: cutoff }), 'expiring_soon', NOW)).toBe(true)
    expect(shareMatchesStatus(subject({ expiresAt: cutoff + 1 }), 'expiring_soon', NOW)).toBe(false)
    expect(shareMatchesStatus(subject({ expiresAt: cutoff + 1 }), 'expiring', NOW)).toBe(true)
  })

  it('treats a paused share with a future end date as expiring, and the categories as overlap', () => {
    const paused = subject({ isEnabled: false, expiresAt: NOW + DAY })
    expect(shareMatchesStatus(paused, 'paused', NOW)).toBe(true)
    expect(shareMatchesStatus(paused, 'active', NOW)).toBe(false)
    // Not a partition: `expiring` asks about the end date only, exactly as its SQL does, so a paused
    // share is in both categories. A predicate that made them exclusive would disagree with the query.
    expect(shareMatchesStatus(paused, 'expiring', NOW)).toBe(true)
    expect(shareMatchesStatus(subject(), 'permanent', NOW)).toBe(true)
    expect(shareMatchesStatus(subject(), 'active', NOW)).toBe(true)
    expect(shareMatchesStatus(subject({ isPinned: true, isStarred: true, hasPassword: true }), 'pinned', NOW)).toBe(true)
    expect(shareMatchesStatus(subject({ isPinned: true, isStarred: true, hasPassword: true }), 'starred', NOW)).toBe(true)
    expect(shareMatchesStatus(subject({ isPinned: true, isStarred: true, hasPassword: true }), 'password', NOW)).toBe(true)
  })

  it('composes a target with a status, and an absent field with nothing', () => {
    const share = subject({ tags: ['Research'], isEnabled: false })
    expect(shareMatchesSelection(share, { status: 'paused', target: { type: 'tag', value: 'Research' } }, NOW)).toBe(true)
    expect(shareMatchesSelection(share, { status: 'active', target: { type: 'tag', value: 'Research' } }, NOW)).toBe(false)
    expect(shareMatchesSelection(share, {}, NOW)).toBe(true)
  })
})

describe('the traffic filters on a visit', () => {
  it('excludes bots unless asked not to, and takes the other two only when they are on', () => {
    const bot = { isBot: true, isSelfReferrer: false, isOwner: false }
    const owner = { isBot: false, isSelfReferrer: false, isOwner: true }
    const self = { isBot: false, isSelfReferrer: true, isOwner: false }
    expect(visitMatchesTraffic(bot, {})).toBe(false)
    expect(visitMatchesTraffic(bot, { excludeBots: false })).toBe(true)
    expect(visitMatchesTraffic(owner, {})).toBe(true)
    expect(visitMatchesTraffic(owner, { excludeOwner: true })).toBe(false)
    expect(visitMatchesTraffic(self, {})).toBe(true)
    expect(visitMatchesTraffic(self, { excludeSelfReferrers: true })).toBe(false)
  })
})
