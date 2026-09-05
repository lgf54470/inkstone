import { Activity } from 'lucide-react'
import type { BlogGlobalAnalytics } from '@shared/types'
import { t } from '../../../lib/i18n'
import { countryFlag, countryNameLocalized } from '../../share'
import { relativeTime } from '../../../lib/time'

interface VisitLogsCardProps {
    analytics: BlogGlobalAnalytics | null
    locale: string
}

export function VisitLogsCard({ analytics, locale }: VisitLogsCardProps) {
    return (<><div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-[var(--accent)]" />
              <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]">
                {t('blog.realtime_logs')}
              </h3>
              <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.2 text-[length:var(--text-10\.5)] font-medium text-[var(--accent)]">
                {analytics?.recentVisits?.length ?? 0}
              </span>
            </div>
            <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
              {t('blog.recent_visits_count')}
            </span>
          </div>

          <div className="flex-1 divide-y divide-[var(--border-subtle)] pt-1 overflow-y-auto max-h-[360px]">
            {!analytics?.recentVisits || analytics.recentVisits.length === 0 ? (
              <p className="py-12 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
                {t('blog.no_visit_data')}
              </p>
            ) : (
              analytics.recentVisits.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] -mx-2 px-2 rounded-[var(--r-md)] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[length:var(--text-13)]">{countryFlag(v.country)}</span>
                    <span className="truncate font-medium text-[var(--text-primary)] max-w-[180px]">
                      {v.postTitle || v.slug}
                    </span>
                    <span className="text-[length:var(--text-11)] text-[var(--text-tertiary)] hidden sm:inline">
                      ({countryNameLocalized(v.country, locale)}
                      {v.city ? ` · ${v.city}` : ''})
                    </span>
                    {v.isBot && (
                      <span className="rounded bg-[var(--danger-subtle)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--danger)]">
                        🤖 {v.botName || 'Bot'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                    <span className="rounded bg-[var(--bg-base)] px-1.5 py-0.5 font-mono">
                      {v.browser || 'Other'} / {v.os || 'other'}
                    </span>
                    {v.referrerHost && (
                      <span className="truncate max-w-[100px] hidden md:inline" title={v.referrerHost}>
                        {v.referrerHost}
                      </span>
                    )}
                    <span className="font-mono">{relativeTime(v.visitedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div></>);
}
