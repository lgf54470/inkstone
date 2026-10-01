import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogGlobalAnalytics } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { buildBlogDashboardCsv, exportBlogDashboardCsv } from './blog-dashboard-export'

/**
 * FEA-09: the dashboard's range data as a file. The load-bearing parts are the ones that stop the
 * file from disagreeing with the screen — the window it names, the filter state it admits to, the
 * localized names it borrows from the same cards — plus the two places it deliberately does *not*
 * copy the screen: a card that shows five operating systems to fit a panel is not a statement that
 * there are five, so the export writes every row it was given, and the stored all-time counter rides
 * along named as what it is instead of being folded into the range numbers.
 */
const FILTERS_OFF = { excludeBots: false, excludeSelf: false, excludeOwner: false }

function analyticsFixture(overrides: Partial<BlogGlobalAnalytics> = {}): BlogGlobalAnalytics {
  return {
    range: 'all',
    totalPosts: 12,
    publishedPosts: 9,
    draftPosts: 3,
    totalViews: 1200,
    totalVisitors: 340,
    storedViews: 4000,
    viewsDelta: 15,
    visitorsDelta: -4,
    viewsPerDay: 40,
    sparklineViews: [],
    sparklineVisitors: [],
    timeline: [{ label: 'Sep 20', timestamp: 0, views: 120, visitors: 41 }],
    topPosts: [{ postId: 'p1', title: 'Read post', slug: 'read-post', views: 80, visitors: 60 }],
    topCountries: [{ name: 'US', count: 45, percentage: 32 }],
    topReferrers: [{ name: 'Direct', count: 20, percentage: 14 }],
    devices: [{ name: 'desktop', count: 30, percentage: 21 }],
    osList: Array.from({ length: 6 }, (_, i) => ({ name: `os-${i}`, count: 6 - i, percentage: 1 })),
    browsers: [{ name: 'Chrome', count: 25, percentage: 18 }],
    recentVisits: [recentVisitFixture()],
    filterStats: { bots: 12, selfReferrals: 3, owner: 5 },
    ...overrides,
  }
}

function recentVisitFixture(): BlogGlobalAnalytics['recentVisits'][number] {
  return {
    id: 1,
    postId: 'p1',
    postTitle: 'Read post',
    slug: 'read-post',
    visitedAt: 1_700_000_000_000,
    country: 'US',
    region: null,
    city: 'Austin',
    referrer: null,
    referrerHost: 'ref.example',
    deviceType: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    isBot: false,
  }
}

/** Parses the fixture's own section/item/value output back into rows. */
function rows(csv: string): Array<{ section: string; item: string; value: string }> {
  return csv
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .slice(1)
    .map((line) => {
      const cells = line.match(/"((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)"/)
      if (!cells) throw new Error(`unparseable row: ${line}`)
      return { section: cells[1].replace(/""/g, '"'), item: cells[2].replace(/""/g, '"'), value: cells[3].replace(/""/g, '"') }
    })
}

function rowOf(csv: string, item: string) {
  return rows(csv).find((row) => row.item === item)
}

function build(overrides: Partial<Parameters<typeof buildBlogDashboardCsv>[0]> = {}): string {
  return buildBlogDashboardCsv({
    analytics: analyticsFixture(),
    range: 'all',
    filters: FILTERS_OFF,
    locale: 'en-US',
    generatedAt: 1_700_000_000_000,
    ...overrides,
  })
}

beforeEach(async () => {
  // Real messages, so the file's labels are read as the sentences the cards draw.
  await initI18n()
})

describe('blog dashboard CSV context (FEA-09)', () => {
  it('opens with the section/item/value header the rows below it use', () => {
    const firstLine = build().replace(/^\uFEFF/, '').split('\r\n')[0]
    expect(firstLine).toBe(
      [t('share.export_col_section'), t('share.export_col_item'), t('share.export_col_value')]
        .map((cell) => `"${cell}"`)
        .join(','),
    )
  })

  it('names the window it describes, in the words the range control uses', () => {
    expect(rowOf(build({ range: 'all' }), t('blog.range_label'))?.value).toBe(t('blog.range_all'))
    // A bounded range carries no translation of its own: the control prints it as it is.
    expect(rowOf(build({ range: '30d' }), t('blog.range_label'))?.value).toBe('30d')
  })

  it('stamps when it was taken, so an old file cannot pass as a current reading', () => {
    expect(rowOf(build(), t('share.export_generated_at'))?.value).toBe(
      new Date(1_700_000_000_000).toISOString(),
    )
  })

  it('reports the filter state with the same badge wording the shared popover draws', () => {
    const label = t('share.filter_traffic_title')
    expect(rowOf(build(), label)?.value).toBe(t('share.filter_all_traffic_badge'))
    expect(rowOf(build({ filters: { excludeBots: true, excludeSelf: false, excludeOwner: false } }), label)?.value)
      .toBe(t('share.filter_real_visitors_badge'))
    expect(rowOf(build({ filters: { excludeBots: true, excludeSelf: true, excludeOwner: true } }), label)?.value)
      .toBe(t('share.filter_real_visitors_badge'))
  })

  it('says what the filters removed, with the counts, when a filter is on', () => {
    const filters = { excludeBots: true, excludeSelf: true, excludeOwner: true }
    const expected = t('share.filter_stats_summary', { bots: 12, self: 3, owner: 5 })

    expect(rowOf(build({ filters }), t('share.export_excluded'))?.value).toBe(expected)
    // An unfiltered file has nothing to admit to, and a line reading "filtered 0 bot hits" would read
    // as a claim about the traffic rather than the absence of a filter.
    expect(rowOf(build(), t('share.export_excluded'))).toBeUndefined()
  })
})

describe('blog dashboard CSV series (FEA-09)', () => {
  it('carries both series of the timeline, since the switch picks only one on screen', () => {
    const csv = build()
    expect(rowOf(csv, `Sep 20 · ${t('blog.metric_pv')}`)?.value).toBe('120')
    expect(rowOf(csv, `Sep 20 · ${t('blog.metric_uv')}`)?.value).toBe('41')
  })

  it('names the all-time counter as an all-time counter instead of a range number', () => {
    const csv = build()
    const item = t('blog.stored_views_hint', { count: 4000 })
    expect(rowOf(csv, item)?.value).toBe('4000')
  })

  it('writes every row of a breakdown the card truncates to fit its panel', () => {
    const csv = build()
    const osRows = rows(csv).filter((row) => row.section === t('share.devices_and_systems') && row.item.startsWith('os-'))
    expect(osRows).toHaveLength(6)
  })

  it('draws the names the cards draw: localized countries, Direct as an access type, devices in words', () => {
    const csv = build()
    expect(rowOf(csv, `${t('share.direct_access')} (14%)`)).toBeDefined()
    expect(rowOf(csv, `${t('share.device_desktop')} (21%)`)).toBeDefined()
    expect(rows(csv).some((row) => row.item.startsWith('United States'))).toBe(true)
  })

  it('carries the visit tail with its flags and an ISO timestamp', () => {
    const csv = build({
      analytics: analyticsFixture({
        recentVisits: [{ ...recentVisitFixture(), isBot: true, botName: 'GPTBot', isOwner: true }],
      }),
    })
    const visit = rows(csv).find((row) => row.section === t('share.recent_activity_title'))
    expect(visit?.value).toBe(new Date(1_700_000_000_000).toISOString())
    expect(visit?.item).toContain('GPTBot')
    expect(visit?.item).toContain(t('share.badge_owner'))
  })
})

describe('blog dashboard CSV hand-over (FEA-09)', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:blog-export')
    URL.revokeObjectURL = vi.fn()
    // The hand-over appends an anchor and clicks it; jsdom would log a navigation it cannot perform.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreateObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: originalRevokeObjectURL })
  })

  function exportOnce(analytics: BlogGlobalAnalytics | null, range: '24h' | '7d' | '30d' | 'all' = 'all') {
    const toast = vi.fn()
    exportBlogDashboardCsv({ analytics, range, filters: FILTERS_OFF, locale: 'en-US', toast })
    return toast
  }

  it('hands over the data it is describing and reports the export', () => {
    const createUrl = vi.mocked(URL.createObjectURL)
    const toast = exportOnce(analyticsFixture(), '30d')

    expect(createUrl).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: t('share.export_dashboard_success') }))
  })

  it('refuses to hand over an empty file when the dashboard has nothing on screen', () => {
    const createUrl = vi.mocked(URL.createObjectURL)
    const toast = exportOnce(null)

    expect(createUrl).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})
