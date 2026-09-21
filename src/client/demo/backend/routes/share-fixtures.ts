import type { ShareBreakdownItem, ShareVisitLog } from '@shared/types'
import { CHANNEL_UNMARKED, CHANNEL_UNRECOGNIZED, collectionChannelToken } from '@shared/share-channel'

/**
 * The demo backend's share fixtures. Kept apart from the route handlers because this is data the
 * routes read, not logic they run: the constants below describe one plausible month of traffic and
 * nothing here branches.
 */

export const SHARE_TOP_COUNTRIES = [
  { name: 'US', count: 120, percentage: 30 },
  { name: 'CN', count: 95, percentage: 24 },
  { name: 'JP', count: 60, percentage: 15 },
  { name: 'DE', count: 40, percentage: 10 },
  { name: 'GB', count: 32, percentage: 8 },
]

export const SHARE_TOP_REFERRERS = [
  { name: 'Direct', count: 180, percentage: 45 },
  { name: 'x.com', count: 95, percentage: 24 },
  { name: 'github.com', count: 62, percentage: 16 },
  { name: 'google.com', count: 40, percentage: 10 },
]

export const SHARE_DEVICES = [
  { name: 'Desktop', count: 240, percentage: 60 },
  { name: 'Mobile', count: 140, percentage: 35 },
  { name: 'Tablet', count: 17, percentage: 5 },
]

export const SHARE_OS_LIST = [
  { name: 'macOS', count: 160, percentage: 40 },
  { name: 'Windows', count: 120, percentage: 30 },
  { name: 'iOS', count: 80, percentage: 20 },
  { name: 'Android', count: 37, percentage: 10 },
]

/**
 * The demo's seeded collection (`state.ts`) publishes this slug, so the marker its directory hands
 * out is this — built through the shared builder as it is in the product, never typed by hand.
 */
export const SHARE_DEMO_COLLECTION_SLUG = 'demo-collection'
export const SHARE_DEMO_COLLECTION_CHANNEL = collectionChannelToken(SHARE_DEMO_COLLECTION_SLUG)

/**
 * The channel split of the demo dashboard: a real marker (the newsletter copies), the visits with
 * no marker, the ones whose marker was refused — the last row exists because the real dashboard has
 * it, and a demo that hides it would misrepresent what switching the feature on does — and one
 * directory's row, which the route labels with the collection's title the way the worker does.
 */
export const SHARE_CHANNELS: ShareBreakdownItem[] = [
  { name: CHANNEL_UNMARKED, count: 200, percentage: 50 },
  { name: 'newsletter', count: 120, percentage: 30 },
  { name: SHARE_DEMO_COLLECTION_CHANNEL, count: 40, percentage: 10 },
  { name: CHANNEL_UNRECOGNIZED, count: 40, percentage: 10 },
]

export const SHARE_BROWSERS = [
  { name: 'Chrome', count: 210, percentage: 53 },
  { name: 'Safari', count: 110, percentage: 28 },
  { name: 'Firefox', count: 45, percentage: 11 },
  { name: 'Edge', count: 32, percentage: 8 },
]

export type ShareVisitSample = Omit<ShareVisitLog, 'visitedAt'> & { offsetMs: number }

export const SHARE_VISIT_SAMPLES: ShareVisitSample[] = [
  {
    id: 1,
    noteId: 'demo-note-1',
    noteTitle: 'Getting Started with Inkstone',
    slug: 'welcome-guide',
    offsetMs: 1000 * 60 * 5,
    country: 'US',
    region: 'California',
    city: 'San Francisco',
    referrer: 'https://x.com',
    referrerHost: 'x.com',
    deviceType: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    isBot: false,
    visitorFp: 'a1b2c3d4',
    channel: 'newsletter',
  },
  {
    id: 2,
    noteId: 'demo-note-1',
    noteTitle: 'Getting Started with Inkstone',
    slug: 'welcome-guide',
    offsetMs: 1000 * 60 * 25,
    country: 'CN',
    region: 'Beijing',
    city: 'Beijing',
    referrer: null,
    referrerHost: null,
    deviceType: 'mobile',
    os: 'iOS',
    browser: 'Safari',
    isBot: false,
    visitorFp: 'e5f6g7h8',
  },
  {
    id: 3,
    noteId: 'demo-note-2',
    noteTitle: 'Architecture Overview',
    slug: 'arch-overview',
    offsetMs: 1000 * 60 * 60,
    country: 'US',
    region: null,
    city: null,
    referrer: 'https://google.com',
    referrerHost: 'google.com',
    deviceType: 'desktop',
    os: 'Linux',
    browser: 'Googlebot',
    isBot: true,
    botName: 'Googlebot',
    visitorFp: 'bot-google-1',
  },
  {
    id: 4,
    noteId: 'demo-note-2',
    noteTitle: 'Architecture Overview',
    slug: 'arch-overview',
    offsetMs: 1000 * 60 * 120,
    country: 'CN',
    region: 'Shanghai',
    city: 'Shanghai',
    referrer: 'https://inkstone.app/editor',
    referrerHost: 'inkstone.app',
    deviceType: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    isBot: false,
    isOwner: true,
    isSelfReferrer: true,
    visitorFp: 'owner-fp-1',
  },
]
