import type { ShareBreakdownItem, ShareGlobalAnalytics, ShareTimelineRange } from '@shared/types'
import { downloadTextFile } from '../../lib/export-note'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import {
  countryNameLocalized,
  csvCell,
  localizeDeviceName,
  localizeEnvName,
  localizeReferrerName,
  trafficFilterLabel,
} from './share-helpers'

/**
 * SH-64: the dashboard could describe a window but not hand it over. The file opens with the window
 * it describes — range, filters, what they removed, and when it was taken — because a CSV loses
 * every piece of context the screen had, and numbers without a window answer nothing later.
 *
 * The sections are the dashboard's own cards, the labels are the ones those cards draw, and the
 * names are localized exactly as drawn, so the file and the screen cannot describe the same visit
 * two different ways. Cards that truncate their rows for space (the OS list shows five) are *not*
 * truncated here: the payload is the full answer, and a cap that exists to fit a card is not a
 * statement about the data.
 */

/** One row of the export: the card it came from, what it names, and its number. */
type CsvRow = [section: string, item: string, value: string | number]

interface ExportInput {
  analytics: ShareGlobalAnalytics
  range: ShareTimelineRange
  filters: { excludeBots: boolean; excludeSelf: boolean; excludeOwner: boolean }
  locale: string
  generatedAt: number
}

export function buildDashboardCsv(input: ExportInput): string {
  const rows = [
    ...contextRows(input),
    ...kpiRows(input.analytics),
    ...timelineRows(input.analytics),
    ...topNoteRows(input.analytics),
    ...breakdownRows(t('share.top_countries_title'), input.analytics.topCountries, (item) =>
      countryNameLocalized(item.name, input.locale),
    ),
    ...breakdownRows(t('share.top_referrers_title'), input.analytics.topReferrers, (item) =>
      localizeReferrerName(item.name),
    ),
    ...environmentRows(input.analytics),
    ...recentVisitRows(input.analytics, input.locale),
  ]
  const header: CsvRow = [t('share.export_col_section'), t('share.export_col_item'), t('share.export_col_value')]
  return toCsv([header, ...rows])
}

/**
 * What the numbers below are: the window, whether anything was filtered out of it, the endpoint's
 * standing scope, and the moment of the reading. The exclusions are stated in the same sentence the
 * dashboard's banner uses, and only when a filter is actually on.
 */
function contextRows(input: ExportInput): CsvRow[] {
  const { analytics, range, filters, generatedAt } = input
  const section = t('share.export_context')
  const rows: CsvRow[] = [
    [section, t('share.range_label'), range === 'all' ? t('share.range_all') : range],
    [section, t('share.export_generated_at'), new Date(generatedAt).toISOString()],
    [section, t('share.export_scope'), t('share.analytics_dashboard_scope')],
    [
      section,
      t('share.filter_traffic_title'),
      trafficFilterLabel(filters.excludeBots, filters.excludeSelf, filters.excludeOwner),
    ],
  ]
  const isFilteringAnything = filters.excludeBots || filters.excludeSelf || filters.excludeOwner
  if (isFilteringAnything) {
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

/**
 * The four headline cards, plus each one's delta as its own row. A delta belongs next to the
 * promise it makes — the previous period, which this file does not contain — so it carries that
 * wording rather than sitting unlabelled beside an absolute number.
 */
function kpiRows(analytics: ShareGlobalAnalytics): CsvRow[] {
  const section = t('share.analytics_dashboard_title')
  const rows: CsvRow[] = [
    [section, t('share.total_views_pv'), analytics.totalViews],
    ...deltaRow(section, t('share.total_views_pv'), analytics.viewsDelta),
    [section, t('share.total_visitors_uv'), analytics.totalVisitors],
    ...deltaRow(section, t('share.total_visitors_uv'), analytics.visitorsDelta),
    [section, t('share.active_shares_count'), `${analytics.activeShares} / ${analytics.totalShares}`],
    [section, t('share.views_per_day'), analytics.viewsPerDay],
    ...deltaRow(section, t('share.views_per_day'), analytics.viewsPerDayDelta),
  ]
  return rows
}

function deltaRow(section: string, metric: string, delta: number | undefined): CsvRow[] {
  if (delta === undefined) return []
  return [[section, `${metric} · ${t('share.delta_vs_previous')}`, delta]]
}

/** Both series of the timeline, one row each: the card draws whichever the metric switch picks. */
function timelineRows(analytics: ShareGlobalAnalytics): CsvRow[] {
  const section = t('share.timeline_trend_title')
  return analytics.timeline.flatMap((point): CsvRow[] => [
    [section, `${point.label} · ${t('share.metric_pv')}`, point.views],
    [section, `${point.label} · ${t('share.metric_uv')}`, point.visitors],
  ])
}

function topNoteRows(analytics: ShareGlobalAnalytics): CsvRow[] {
  const section = t('share.top_notes_title')
  return analytics.topNotes.flatMap((note): CsvRow[] => {
    const title = note.noteTitle || t('common.untitled_note')
    return [
      [section, `${title} · ${t('share.metric_pv')}`, note.views],
      [section, `${title} · ${t('share.metric_uv')}`, note.visitors],
    ]
  })
}

/** A breakdown list: the name the card shows, with the share of the total the card prints beside it. */
function breakdownRows(
  section: string,
  items: ShareBreakdownItem[],
  name: (item: ShareBreakdownItem) => string,
): CsvRow[] {
  return items.map((item) => [section, withPercentage(name(item), item.percentage), item.count])
}

function withPercentage(name: string, percentage: number | undefined): string {
  return percentage === undefined ? name : `${name} (${percentage}%)`
}

/** Devices and systems as the one card draws them, names localized the same way. */
function environmentRows(analytics: ShareGlobalAnalytics): CsvRow[] {
  const section = t('share.devices_and_systems')
  return [
    ...analytics.devices.map((item): CsvRow => [
      section,
      `${t('share.device_type')} · ${localizeDeviceName(item.name)}`,
      item.count,
    ]),
    ...analytics.osList.map((item): CsvRow => [
      section,
      `${t('share.operating_system')} · ${localizeEnvName(item.name)}`,
      item.count,
    ]),
  ]
}

/**
 * The visit tail the activity card lists. The value is the timestamp alone so it sorts and compares
 * as one, and everything the row says about the visit rides in the item.
 */
function recentVisitRows(analytics: ShareGlobalAnalytics, locale: string): CsvRow[] {
  const section = t('share.recent_activity_title')
  return analytics.recentVisits.map((visit): CsvRow => {
    const parts = [
      visit.noteTitle || t('common.untitled_note'),
      [countryNameLocalized(visit.country, locale), visit.city].filter(Boolean).join(' · '),
      `${localizeEnvName(visit.browser)} / ${localizeEnvName(visit.os)}`,
      visit.referrerHost || '',
      ...visitFlags(visit),
    ]
    return [section, parts.filter((part) => part !== '').join(' | '), new Date(visit.visitedAt).toISOString()]
  })
}

function visitFlags(visit: ShareGlobalAnalytics['recentVisits'][number]): string[] {
  return [
    visit.isBot ? visit.botName || t('share.badge_bot') : '',
    visit.isOwner ? t('share.badge_owner') : '',
    visit.isSelfReferrer ? t('share.badge_self_referrer') : '',
  ]
}

function toCsv(rows: CsvRow[]): string {
  // The BOM makes a spreadsheet read the UTF-8 place names as text rather than mojibake.
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function exportDashboardCsv(params: {
  analytics: ShareGlobalAnalytics | null
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
  const csv = buildDashboardCsv({ analytics, range, filters, locale, generatedAt: Date.now() })
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(`inkstone-share-analytics-${range}-${stamp}.csv`, csv, 'text/csv;charset=utf-8')
  toast({ title: t('share.export_dashboard_success'), tone: 'success' })
}
