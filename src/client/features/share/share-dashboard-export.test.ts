import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareGlobalAnalytics } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { buildDashboardCsv, exportDashboardCsv } from './share-dashboard-export'

/**
 * SH-64: the dashboard's range data as a file. The load-bearing parts are the ones that stop the
 * file from disagreeing with the screen — the window it names, the filters it admits to, and the
 * labels and localized names it borrows from the same cards — plus the one place it deliberately
 * does *not* copy the screen: a card that shows five operating systems to fit a panel is not a
 * statement that there are five, so the export writes every row it was given.
 */
function analyticsFixture(overrides: Partial<ShareGlobalAnalytics> = {}): ShareGlobalAnalytics {
  return {
    range: 'all',
    totalShares: 12,
    activeShares: 9,
    totalViews: 1200,
    totalVisitors: 340,
    viewsDelta: 15,
    visitorsDelta: -4,
    viewsPerDay: 40,
    viewsPerDayDelta: 3,
    sparklineViews: [],
    sparklineVisitors: [],
    timeline: [{ label: 'Sep 20', timestamp: 0, views: 120, visitors: 41 }],
    topNotes: [{ noteId: 'n1', noteTitle: 'Shared note', slug: 'abc123', views: 80, visitors: 60 }],
    topCountries: [{ name: 'US', count: 45, percentage: 32 }],
    topReferrers: [{ name: 'Direct', count: 20, percentage: 14 }],
    devices: [{ name: 'desktop', count: 30, percentage: 21 }],
    osList: Array.from({ length: 6 }, (_, i) => ({ name: `os-${i}`, count: 6 - i, percentage: 1 })),
    browsers: [{ name: 'Chrome', count: 25, percentage: 18 }],
    recentVisits: [recentVisitFixture()],
    staleLinks: {
      thresholdDays: 90,
      total: 3,
      neverViewed: 1,
      items: [{ noteId: 'n2', noteTitle: 'Forgotten note', slug: 'forgotten', lastViewedAt: null, views: 0 }],
    },
    filterStats: { bots: 12, selfReferrals: 3, owner: 5 },
    ...overrides,
  }
}

function recentVisitFixture(): ShareGlobalAnalytics['recentVisits'][number] {
  return {
    id: 1,
    noteId: 'n1',
    noteTitle: 'Shared note',
    slug: 'abc123',
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

/** Parses the fixture's own two-column-plus-section output back into rows. */
function rows(csv: string): Array<{ section: string; item: string; value: string }> {
  return csv
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .slice(1)
    .map((line) => {
      const cells = line.slice(1, -1).split('","')
      return { section: cells[0], item: cells[1], value: cells[2] }
    })
}

function rowOf(csv: string, item: string) {
  return rows(csv).find((row) => row.item === item)
}

const FILTERS_OFF = { excludeBots: false, excludeSelf: false, excludeOwner: false }

function build(overrides: {
  analytics?: ShareGlobalAnalytics
  filters?: typeof FILTERS_OFF
  range?: '24h' | '7d' | '30d' | 'all'
} = {}) {
  return buildDashboardCsv({
    analytics: overrides.analytics ?? analyticsFixture(),
    range: overrides.range ?? 'all',
    filters: overrides.filters ?? FILTERS_OFF,
    locale: 'en-US',
    generatedAt: 1_700_000_000_000,
  })
}

beforeEach(async () => {
  // Real messages, so the file's labels are read as the sentences the cards draw.
  await initI18n()
})

describe('dashboard CSV context (SH-64)', () => {
  it('opens with the section/item/value header the rows below it use', () => {
    const firstLine = build().replace(/^\uFEFF/, '').split('\r\n')[0]
    expect(firstLine).toBe(
      [t('share.export_col_section'), t('share.export_col_item'), t('share.export_col_value')]
        .map((cell) => `"${cell}"`)
        .join(','),
    )
  })

  it('names the window it describes, in the words the range control uses', () => {
    expect(rowOf(build({ range: 'all' }), t('share.range_label'))?.value).toBe(t('share.range_all'))
    // A bounded range carries no translation of its own: the control prints it as it is.
    expect(rowOf(build({ range: '30d' }), t('share.range_label'))?.value).toBe('30d')
  })

  it('stamps when it was taken, so an old file cannot pass as a current reading', () => {
    expect(rowOf(build(), t('share.export_generated_at'))?.value).toBe(
      new Date(1_700_000_000_000).toISOString(),
    )
  })

  it('states the scope the numbers have on screen: every share, not the sidebar selection', () => {
    expect(rowOf(build(), t('share.export_scope'))?.value).toBe(t('share.analytics_dashboard_scope'))
  })

  it('reports the filter state with the same badge wording as the dashboard', () => {
    const label = t('share.filter_traffic_title')
    expect(rowOf(build(), label)?.value).toBe(t('share.filter_all_traffic_badge'))
    expect(rowOf(build({ filters: { excludeBots: true, excludeSelf: false, excludeOwner: false } }), label)?.value)
      .toBe(t('share.filter_real_visitors_badge'))
    expect(rowOf(build({ filters: { excludeBots: false, excludeSelf: true, excludeOwner: false } }), label)?.value)
      .toBe(t('share.filter_custom_traffic_badge'))
  })

  it('says what the filters removed, with the counts, when a filter is on', () => {
    const filters = { excludeBots: true, excludeSelf: true, excludeOwner: true }
    const csv = build({ filters })
    const expected = t('share.filter_stats_summary', { bots: 12, self: 3, owner: 5 })

    expect(rowOf(csv, t('share.export_excluded'))?.value).toBe(expected)
    // An unfiltered file has nothing to admit to, and a line reading "filtered 0 bot hits" would
    // read as a claim about the traffic rather than the absence of a filter.
    expect(rowOf(build(), t('share.export_excluded'))).toBeUndefined()
  })
})

describe('dashboard CSV series (SH-64)', () => {
  it('carries both series of the timeline, since the switch picks only one on screen', () => {
    const csv = build()
    expect(rowOf(csv, `Sep 20 · ${t('share.metric_pv')}`)?.value).toBe('120')
    expect(rowOf(csv, `Sep 20 · ${t('share.metric_uv')}`)?.value).toBe('41')
  })

  it('labels a delta with the period it compares against rather than beside the absolute number', () => {
    const csv = build()
    expect(rowOf(csv, t('share.total_views_pv'))?.value).toBe('1200')
    expect(rowOf(csv, `${t('share.total_views_pv')} · ${t('share.delta_vs_previous')}`)?.value).toBe('15')
    // A delta the endpoint did not send is left out rather than written as zero.
    const withoutDeltas = build({
      analytics: analyticsFixture({ viewsDelta: undefined, visitorsDelta: undefined, viewsPerDayDelta: undefined }),
    })
    expect(rows(withoutDeltas).some((row) => row.item.includes(t('share.delta_vs_previous')))).toBe(false)
  })

  it('writes every row of a list the card truncates to fit its panel', () => {
    const osRows = rows(build()).filter((row) => row.item.startsWith(`${t('share.operating_system')} · `))
    // The card draws five of six to fit the grid; the file reports what it was given.
    expect(osRows).toHaveLength(6)
  })

})

describe('dashboard CSV naming (SH-64)', () => {
  it('names devices, referrers and countries the way the cards name them', () => {
    const csv = build()
    expect(rowOf(csv, `${t('share.device_type')} · ${t('share.device_desktop')}`)?.value).toBe('30')
    expect(rowOf(csv, `${t('share.direct_access')} (14%)`)?.value).toBe('20')
    expect(rowOf(csv, 'United States (32%)')?.value).toBe('45')
  })

  it('shows a share of the total only where the card prints one', () => {
    const withAndWithout = analyticsFixture({
      topCountries: [{ name: 'US', count: 45, percentage: 32 }, { name: 'DE', count: 5 }],
    })

    expect(rowOf(build({ analytics: withAndWithout }), 'United States (32%)')).toBeDefined()
    // A count with no share sent for it is written as a bare name, not as "(undefined%)".
    expect(rowOf(build({ analytics: withAndWithout }), 'Germany')).toBeDefined()
  })

  it('lists the visit tail with a sortable timestamp and the row\'s own context', () => {
    const visit = rowOf(build(), `Shared note | United States · Austin | Chrome / macOS | ref.example`)
    expect(visit?.section).toBe(t('share.recent_activity_title'))
    expect(visit?.value).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('marks a bot visit with the name the badge shows', () => {
    const fixture = analyticsFixture()
    const csv = build({
      analytics: analyticsFixture({
        recentVisits: [{ ...fixture.recentVisits[0], isBot: true, botName: 'Googlebot' }],
      }),
    })
    expect(rows(csv).some((row) => row.item.includes('Googlebot'))).toBe(true)
  })

})

describe('dashboard CSV edge cases (SH-64)', () => {
  it('writes the hygiene count under the threshold it was measured against', () => {
    const csv = build()
    expect(rowOf(csv, t('share.stale_links_badge', { days: 90 }))?.value).toBe('3')
  })

  it('leaves the hygiene line out when the owner turned the report off', () => {
    // Off is not the same as "nothing went quiet": a zero written under an off switch would read
    // as a clean bill of health for links nobody ever measured.
    const off = analyticsFixture({ staleLinks: { thresholdDays: 0, total: 0, neverViewed: 0, items: [] } })
    const csv = build({ analytics: off })

    expect(rows(csv).some((row) => row.section === t('share.stale_links_title'))).toBe(false)
  })

  it('still describes its window when the range held no traffic', () => {
    const empty = analyticsFixture({
      timeline: [],
      topNotes: [],
      topCountries: [],
      topReferrers: [],
      devices: [],
      osList: [],
      recentVisits: [],
    })
    const csv = build({ analytics: empty })
    expect(rowOf(csv, t('share.range_label'))).toBeDefined()
    expect(rows(csv).some((row) => row.section === t('share.timeline_trend_title'))).toBe(false)
  })

  it('keeps a title that starts with = from becoming a formula in a spreadsheet', () => {
    const csv = build({
      analytics: analyticsFixture({
        topNotes: [{ noteId: 'n1', noteTitle: '=SUM(A1:A9)', slug: 's', views: 1, visitors: 1 }],
      }),
    })
    expect(csv).toContain(`"'=SUM(A1:A9) · ${t('share.metric_pv')}"`)
  })
})

const downloaded: Blob[] = []
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  downloaded.length = 0
  // The download is the module's only side effect; capture the blob and stub the click, as the
  // visit-log export test does.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      downloaded.push(blob)
      return 'blob:csv'
    },
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => {} })
  const appendChild = document.body.appendChild.bind(document.body)
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    if (node instanceof HTMLAnchorElement) node.click = () => {}
    return appendChild(node)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreateObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: originalRevokeObjectURL })
})

function exportOnce(params: { analytics: ShareGlobalAnalytics | null; range?: '24h' | '7d' | '30d' | 'all' }) {
  const toast = vi.fn()
  exportDashboardCsv({
    analytics: params.analytics,
    range: params.range ?? 'all',
    filters: FILTERS_OFF,
    locale: 'en-US',
    toast,
  })
  return toast
}

describe('dashboard CSV hand-over (SH-64)', () => {
  it('hands over the data it is describing, named for the window it came from', async () => {
    const toast = exportOnce({ analytics: analyticsFixture(), range: '30d' })

    expect(downloaded).toHaveLength(1)
    expect(await downloaded[0].text()).toContain(t('share.range_label'))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: t('share.export_dashboard_success') }))
  })

  it('refuses to hand over an empty file when the dashboard has nothing on screen', () => {
    const toast = exportOnce({ analytics: null })

    expect(downloaded).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})
