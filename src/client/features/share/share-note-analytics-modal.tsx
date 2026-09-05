import { useEffect, useState } from 'react'
import {
  Activity,
  BarChart2,
  Compass,
  ExternalLink,
  Globe,
  Lock,
  QrCode,
} from 'lucide-react'
import type {
  ShareNoteAnalytics,
  ShareTimelineRange,
} from '@shared/types'
import { Modal } from '../../components/overlay'
import { Button } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { relativeTime } from '../../lib/time'
import { t, useLocale } from '../../lib/i18n'
import { api } from '../../lib/api'
import { countryFlag, countryNameLocalized } from './share-helpers'
import { BigSvgChart } from './share-dashboard-view'

import { useShareStore } from './share-store'
import { ShareTrafficFilterPopover } from './share-traffic-filter-popover'

export function ShareNoteAnalyticsModal({
  open,
  onClose,
  noteId,
  onOpenQr,
}: {
  open: boolean
  onClose: () => void
  noteId: string
  onOpenQr?: (url: string, title: string, slug: string) => void
}) {
  const locale = useLocale()
  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
  const [data, setData] = useState<ShareNoteAnalytics | null>(null)

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)

  const loadData = async (selectedRange = range) => {
    try {
      const res = await api.share.noteAnalytics(noteId, selectedRange, {
        excludeBots,
        excludeSelf: excludeSelfReferrers,
        excludeOwner,
      })
      setData(res)
    } catch {
    }
  }

  useEffect(() => {
    if (open && noteId) {
      void loadData(range)
    }
  }, [open, noteId, range, excludeBots, excludeSelfReferrers, excludeOwner])

  if (!open) return null

  const RANGE_OPTIONS = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: 'all', label: t('share.range_all') },
  ]

  const timelinePoints = data?.timeline || []
  const chartValues = timelinePoints.map((p) => (metricMode === 'views' ? p.views : p.visitors))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-[var(--accent)]" />
          <span>{t('share.note_analytics_title')}</span>
        </div>
      }
      description={data?.noteTitle || ''}
      width={780}
    >
      <div className="flex flex-col gap-4 py-1 max-h-[75vh] overflow-y-auto pr-1">
        {data && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="flex items-center gap-2 font-mono text-[12px] text-[var(--text-secondary)]">
              <Globe size={14} className="text-[var(--accent)]" />
              <span className="font-semibold text-[var(--text-primary)]">{`/s/${data.slug}`}</span>
              {data.hasPassword && (
                <span className="flex items-center gap-0.5 rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--warning)]">
                  <Lock size={10} /> {t('share.password_protected')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onOpenQr && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<QrCode size={12} />}
                  onClick={() => onOpenQr(data.url, data.noteTitle, data.slug)}
                >
                  {t('share.qr_code_title')}
                </Button>
              )}
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <ExternalLink size={12} />
                <span>{t('preview.open_in_new_tab')}</span>
              </a>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
            <div className="flex min-w-[140px] flex-col rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
              <span className="text-[11px] text-[var(--text-tertiary)]">{t('share.total_views_pv')}</span>
              <span className="font-mono text-[22px] font-bold text-[var(--text-primary)]">
                {data?.totalViews ?? 0}
              </span>
            </div>

            <div className="flex min-w-[140px] flex-col rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
              <span className="text-[11px] text-[var(--text-tertiary)]">{t('share.total_visitors_uv')}</span>
              <span className="font-mono text-[22px] font-bold text-[var(--text-primary)]">
                {data?.totalVisitors ?? 0}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Segmented
              options={RANGE_OPTIONS}
              value={range}
              onChange={(val) => setRange(val as ShareTimelineRange)}
            />
            <ShareTrafficFilterPopover />
          </div>
        </div>

        <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
          <div className="flex items-center justify-between pb-2">
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">
              {t('share.timeline_trend_title')}
            </span>
            <Segmented
              options={[
                { value: 'views', label: t('share.metric_pv') },
                { value: 'visitors', label: t('share.metric_uv') },
              ]}
              value={metricMode}
              onChange={(val) => setMetricMode(val as 'views' | 'visitors')}
            />
          </div>

          <div className="h-48 w-full pt-1">
            <BigSvgChart values={chartValues} timeline={timelinePoints} range={range} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="flex items-center gap-1.5 pb-2 text-[12px] font-semibold text-[var(--text-primary)]">
              <Globe size={13} className="text-[var(--accent)]" />
              <span>{t('share.top_countries_title')}</span>
            </div>
            <div className="space-y-2 pt-1">
              {!data?.topCountries || data.topCountries.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-[var(--text-quaternary)]">
                  {t('share.no_data_yet')}
                </p>
              ) : (
                data.topCountries.slice(0, 5).map((item) => (
                  <BreakdownMiniRow
                    key={item.name}
                    name={countryNameLocalized(item.name, locale)}
                    flag={countryFlag(item.name)}
                    count={item.count}
                    percentage={item.percentage ?? 0}
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="flex items-center gap-1.5 pb-2 text-[12px] font-semibold text-[var(--text-primary)]">
              <Compass size={13} className="text-[var(--accent)]" />
              <span>{t('share.top_referrers_title')}</span>
            </div>
            <div className="space-y-2 pt-1">
              {!data?.topReferrers || data.topReferrers.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-[var(--text-quaternary)]">
                  {t('share.no_data_yet')}
                </p>
              ) : (
                data.topReferrers.slice(0, 5).map((item) => (
                  <BreakdownMiniRow
                    key={item.name}
                    name={item.name}
                    count={item.count}
                    percentage={item.percentage ?? 0}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
          <div className="flex items-center gap-1.5 pb-2 text-[12px] font-semibold text-[var(--text-primary)]">
            <Activity size={13} className="text-[var(--accent)]" />
            <span>{t('share.recent_activity_title')}</span>
          </div>

          <div className="divide-y divide-[var(--border-subtle)] pt-1">
            {!data?.recentVisits || data.recentVisits.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-[var(--text-quaternary)]">
                {t('share.no_visits_yet')}
              </p>
            ) : (
              data.recentVisits.slice(0, 8).map((v) => (
                <div key={v.id} className="flex items-center justify-between py-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span>{countryFlag(v.country)}</span>
                    <span className="text-[var(--text-secondary)]">
                      {countryNameLocalized(v.country, locale)}
                      {v.city ? ` · ${v.city}` : ''}
                    </span>
                    {v.isBot && (
                      <span className="rounded bg-[var(--danger-subtle)] px-1.5 py-0.2 text-[9.5px] font-semibold text-[var(--danger)]">
                        🤖 {v.botName || t('share.badge_bot')}
                      </span>
                    )}
                    {v.isOwner && (
                      <span className="rounded bg-[var(--accent-subtle)] px-1.5 py-0.2 text-[9.5px] font-semibold text-[var(--accent)]">
                        👤 {t('share.badge_owner')}
                      </span>
                    )}
                    {v.isSelfReferrer && (
                      <span className="rounded bg-[var(--warning-subtle)] px-1.5 py-0.2 text-[9.5px] font-semibold text-[var(--warning)]">
                        {t('share.badge_self_referrer')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[var(--text-quaternary)] font-mono">
                    <span>{v.browser} / {v.os}</span>
                    <span>{relativeTime(v.visitedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function BreakdownMiniRow({
  name,
  flag,
  count,
  percentage,
}: {
  name: string
  flag?: string
  count: number
  percentage: number
}) {
  return (
    <div className="flex flex-col gap-0.5 text-[11px]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 truncate text-[var(--text-primary)]">
          {flag && <span>{flag}</span>}
          <span className="truncate">{name}</span>
        </span>
        <div className="flex items-center gap-1 font-mono">
          <span className="font-medium text-[var(--text-primary)]">{count}</span>
          <span className="text-[var(--text-quaternary)]">({percentage}%)</span>
        </div>
      </div>
      <div className="h-1 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
