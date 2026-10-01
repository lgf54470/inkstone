import type { BlogGlobalAnalytics, ShareTimelineRange } from '@shared/types'
import { toCsv } from '../../../lib/csv'
import { downloadTextFile } from '../../../lib/export-note'
import { t } from '../../../lib/i18n'
import type { UiState } from '../../../store/ui'
import {
  countryNameLocalized,
  localizeDeviceName,
  localizePlatformName,
  localizeReferrerName,
} from '../../../lib/visitor-geo'

/**
 * FEA-09: the dashboard could describe a window but not hand it over. The file opens with the window
 * it describes — range, traffic filters, what they removed, and when it was taken — because a CSV
 * loses every piece of context the screen had, and numbers without a window answer nothing later.
 *
 * The sections are the dashboard's own cards and the names are localized exactly as drawn, so the
 * file and the screen cannot describe the same visit two different ways. Cards that truncate their
 * rows for space (the OS list shows five) are *not* truncated here: the payload is the full answer,
 * and a cap that exists to fit a card is not a statement about the data.
 */

/** One row of the export: the card it came from, what it names, and its number. */
type CsvRow = [section: string, item: string, value: string | number]

interface ExportInput {
  analytics: BlogGlobalAnalytics
  range: ShareTimelineRange
  filters: { excludeBots: boolean; excludeSelf: boolean; excludeOwner: boolean }
  locale: string
  generatedAt: number
}

export function buildBlogDashboardCsv(input: ExportInput): string {
  const rows = [
    ...contextRows(input),
    ...kpiRows(input.analytics),
    ...timelineRows(input.analytics),
    ...topPostRows(input.analytics),
    ...breakdownRows(t('share.top_countries_title'), input.analytics.topCountries, (name) =>
      countryNameLocalized(name, input.locale),
    ),
    ...breakdownRows(t('share.top_referrers_title'), input.analytics.topReferrers, (name) =>
      localizeReferrerName(name),
    ),
    ...breakdownRows(t('share.devices_and_systems'), input.analytics.devices, (name) =>
      localizeDeviceName(name),
    ),
    ...breakdownRows(t('share.devices_and_systems'), input.analytics.osList, (name) => name),
    ...breakdownRows(t('share.devices_and_systems'), input.analytics.browsers, (name) => name),
    ...recentVisitRows(input.analytics, input.locale),
  ]
  const header: CsvRow = [t('share.export_col_section'), t('share.export_col_item'), t('share.export_col_value')]
  return toCsv([header, ...rows])
}

/**
 * What the numbers below are: the window, whether anything was filtered out of it, and the moment of
 * the reading. The exclusions are stated in the same sentence the dashboard's banner uses, and only
 * when a filter is actually on.
 */
function contextRows(input: ExportInput): CsvRow[] {
  const { analytics, range, filters, generatedAt } = input
  const section = t('share.export_context')
  const rows: CsvRow[] = [
    [section, t('blog.range_label'), range === 'all' ? t('blog.range_all') : range],
    [section, t('share.export_generated_at'), new Date(generatedAt).toISOString()],
    [section, t('share.filter_traffic_title'), trafficFilterLabel(filters)],
  ]
  if (filters.excludeBots || filters.excludeSelf || filters.excludeOwner) {
    rows.push([
      section,
      t('share.export_excluded'),
      t('share.filter_stats_summary', {
        bots: analytics.filterStats?.bots ?? 0,
        self: analytics.filterStats?.selfReferrals ?? 0,
        owner: analytics.filterStats?.owner ?? 0,
      }),
    ])
  }
  return rows
}

/** The same badge wording the shared filter popover prints; the file and the screen must agree. */
function trafficFilterLabel(filters: ExportInput['filters']): string {
  if (filters.excludeBots) return t('share.filter_real_visitors_badge')
  if (!filters.excludeSelf && !filters.excludeOwner) return t('share.filter_all_traffic_badge')
  return t('share.filter_custom_traffic_badge')
}

/**
 * The headline cards, plus each delta as its own row (it belongs next to the promise it makes — the
 * previous period, which this file does not contain). The stored all-time counter rides along named
 * as what it is: it also holds views a browser reported before this account kept visit rows, so it is
 * not the range's number and must not read as one.
 */
function kpiRows(analytics: BlogGlobalAnalytics): CsvRow[] {
  const section = t('blog.analytics_dashboard_title')
  return [
    [section, t('blog.total_views_pv'), analytics.totalViews],
    ...deltaRow(section, t('blog.total_views_pv'), analytics.viewsDelta),
    [section, t('blog.total_visitors_uv'), analytics.totalVisitors],
    ...deltaRow(section, t('blog.total_visitors_uv'), analytics.visitorsDelta),
    [section, t('blog.views_per_day'), analytics.viewsPerDay],
    [section, t('blog.active_posts_count'), `${analytics.publishedPosts} / ${analytics.totalPosts}`],
    [section, t('blog.stored_views_hint', { count: analytics.storedViews }), analytics.storedViews],
  ]
}

function deltaRow(section: string, metric: string, delta: number | undefined): CsvRow[] {
  if (delta === undefined) return []
  return [[section, `${metric} · ${t('blog.delta_vs_previous')}`, delta]]
}

/** Both series of the timeline, one row each: the card draws whichever the metric switch picks. */
function timelineRows(analytics: BlogGlobalAnalytics): CsvRow[] {
  const section = t('blog.timeline_trend_title')
  return analytics.timeline.flatMap((point): CsvRow[] => [
    [section, `${point.label} · ${t('blog.metric_pv')}`, point.views],
    [section, `${point.label} · ${t('blog.metric_uv')}`, point.visitors],
  ])
}

function topPostRows(analytics: BlogGlobalAnalytics): CsvRow[] {
  const section = t('blog.top_posts_title')
  return analytics.topPosts.flatMap((post): CsvRow[] => [
    [section, `${post.title} · ${t('blog.metric_pv')}`, post.views],
    [section, `${post.title} · ${t('blog.metric_uv')}`, post.visitors],
  ])
}

/** A breakdown list: the name the card shows, with the share of the total the card prints beside it. */
function breakdownRows(
  section: string,
  items: BlogGlobalAnalytics['topCountries'],
  name: (rawName: string) => string,
): CsvRow[] {
  return items.map((item) => [section, withPercentage(name(item.name), item.percentage), item.count])
}

function withPercentage(name: string, percentage: number | undefined): string {
  return percentage === undefined ? name : `${name} (${percentage}%)`
}

/**
 * The visit tail the activity card lists. The value is the timestamp alone so it sorts and compares
 * as one, and everything the row says about the visit rides in the item.
 */
function recentVisitRows(analytics: BlogGlobalAnalytics, locale: string): CsvRow[] {
  const section = t('share.recent_activity_title')
  return analytics.recentVisits.map((visit): CsvRow => {
    const parts = [
      visit.postTitle || visit.slug,
      [countryNameLocalized(visit.country, locale), visit.city].filter(Boolean).join(' · '),
      `${localizePlatformName(visit.browser, t('blog.env_unknown'))} / ${localizePlatformName(visit.os, t('blog.env_unknown'))}`,
      visit.referrerHost || '',
      ...visitFlags(visit),
    ]
    return [section, parts.filter((part) => part !== '').join(' | '), new Date(visit.visitedAt).toISOString()]
  })
}

function visitFlags(visit: BlogGlobalAnalytics['recentVisits'][number]): string[] {
  return [
    visit.isBot ? visit.botName || t('share.badge_bot') : '',
    visit.isOwner ? t('share.badge_owner') : '',
    visit.isSelfReferrer ? t('share.badge_self_referrer') : '',
  ]
}

export function exportBlogDashboardCsv(params: {
  analytics: BlogGlobalAnalytics | null
  range: ShareTimelineRange
  filters: { excludeBots: boolean; excludeSelf: boolean; excludeOwner: boolean }
  locale: string
  toast: UiState['toast']
}): void {
  const { analytics, range, filters, locale, toast } = params
  if (!analytics) {
    // Nothing drawn yet means nothing to hand over; saying so beats writing an empty file.
    toast({ title: t('share.export_dashboard_empty'), tone: 'warning' })
    return
  }
  const csv = buildBlogDashboardCsv({ analytics, range, filters, locale, generatedAt: Date.now() })
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(`inkstone-blog-analytics-${range}-${stamp}.csv`, csv, 'text/csv;charset=utf-8')
  toast({ title: t('share.export_dashboard_success'), tone: 'success' })
}
