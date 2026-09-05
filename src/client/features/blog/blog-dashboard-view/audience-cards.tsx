import { Compass, Globe2, Laptop } from 'lucide-react'
import type { BlogGlobalAnalytics } from '@shared/types'
import { t } from '../../../lib/i18n'
import { countryFlag, countryNameLocalized } from '../../share'
import { BreakdownRow } from '../../../components/dashboard-blocks'

interface AudienceCardsProps {
    analytics: BlogGlobalAnalytics | null
    locale: string
}

export function AudienceCards({ analytics, locale }: AudienceCardsProps) {
    return (<><div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Globe2 size={15} className="text-[var(--accent)]" />
              {t('blog.visitor_geography')}
            </h3>
            <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
              {analytics?.topCountries?.length ?? 0}
            </span>
          </div>

          <div className="space-y-2.5 pt-3">
            {!analytics?.topCountries || analytics.topCountries.length === 0 ? (
              <p className="py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
                {t('blog.no_visit_data')}
              </p>
            ) : (
              analytics.topCountries.map((item) => (
                <BreakdownRow
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

        {/* Traffic Sources */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Compass size={15} className="text-[var(--accent)]" />
              {t('blog.traffic_sources')}
            </h3>
            <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
              {analytics?.topReferrers?.length ?? 0}
            </span>
          </div>

          <div className="space-y-2.5 pt-3">
            {!analytics?.topReferrers || analytics.topReferrers.length === 0 ? (
              <p className="py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
                {t('blog.no_visit_data')}
              </p>
            ) : (
              analytics.topReferrers.map((item) => (
                <BreakdownRow
                  key={item.name}
                  name={item.name}
                  count={item.count}
                  percentage={item.percentage ?? 0}
                />
              ))
            )}
          </div>
        </div>

        {/* Devices and Systems */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Laptop size={15} className="text-[var(--accent)]" />
              {t('blog.devices_and_os')}
            </h3>
          </div>

          <div className="space-y-3 pt-3">
            <p className="text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] uppercase tracking-wider">
              {t('blog.device_type')}
            </p>
            <div className="space-y-2">
              {analytics?.devices.map((d) => (
                <BreakdownRow
                  key={d.name}
                  name={
                    d.name === 'desktop'
                      ? t('share.device_desktop')
                      : d.name === 'mobile'
                        ? t('share.device_mobile')
                        : d.name === 'tablet'
                          ? t('share.device_tablet')
                          : d.name
                  }
                  count={d.count}
                  percentage={d.percentage ?? 0}
                />
              ))}
            </div>

            <p className="pt-2 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] uppercase tracking-wider">
              {t('blog.operating_system')}
            </p>
            <div className="space-y-2">
              {analytics?.osList.slice(0, 5).map((os) => (
                <BreakdownRow
                  key={os.name}
                  name={os.name}
                  count={os.count}
                  percentage={os.percentage ?? 0}
                />
              ))}
            </div>
          </div>
        </div></>);
}
