import { Compass, Globe2, Laptop } from 'lucide-react'
import type { ShareGlobalAnalytics } from '@shared/types'
import { BreakdownRow } from '../../components/dashboard-blocks'
import { t } from '../../lib/i18n'
import { countryFlag, countryNameLocalized, localizeEnvName, localizeReferrerName } from './share-helpers'
import { CardHeader, EmptyRow } from './share-dashboard-card-shell'

/** Where the visitors came from, by country. */
export function CountryBreakdownCard({ analytics, locale }: {
  analytics: ShareGlobalAnalytics | null
  locale: string
}) {
  const topCountries = analytics?.topCountries ?? []
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <CardHeader icon={<Globe2 size={15} className='text-[var(--accent)]' />} title={t('share.top_countries_title')} badge={t('share.visitor_geography')} />
      <div className='space-y-2.5 pt-3'>
        {topCountries.length === 0 ? (
          <EmptyRow label={t('share.no_data_yet')} />
        ) : (
          topCountries.map((item) => (
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
  )
}

/** How the traffic found the link. */
export function ReferrerBreakdownCard({ analytics }: { analytics: ShareGlobalAnalytics | null }) {
  const topReferrers = analytics?.topReferrers ?? []
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <CardHeader icon={<Compass size={15} className='text-[var(--accent)]' />} title={t('share.top_referrers_title')} badge={t('share.traffic_sources')} />
      <div className='space-y-2.5 pt-3'>
        {topReferrers.length === 0 ? (
          <EmptyRow label={t('share.no_data_yet')} />
        ) : (
          topReferrers.map((item) => (
            <BreakdownRow
              key={item.name}
              name={localizeReferrerName(item.name)}
              count={item.count}
              percentage={item.percentage ?? 0}
            />
          ))
        )}
      </div>
    </div>
  )
}

/** Devices and operating systems, as one card — both read the same visit fingerprint. */
export function DevicesBreakdownCard({ analytics }: { analytics: ShareGlobalAnalytics | null }) {
  const devices = analytics?.devices ?? []
  const osList = analytics?.osList ?? []
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <CardHeader icon={<Laptop size={15} className='text-[var(--accent)]' />} title={t('share.devices_and_systems')} badge={t('share.client_environment')} />
      <div className='space-y-3 pt-3'>
        {devices.length === 0 && osList.length === 0 ? <EmptyRow label={t('share.no_data_yet')} /> : (<>
          <p className='text-[length:var(--text-11)] font-semibold uppercase tracking-wider text-[var(--text-quaternary)]'>
            {t('share.device_type')}
          </p>
          <div className='space-y-2'>
            {devices.map((d) => (
              <BreakdownRow
                key={d.name}
                name={localizeDeviceName(d.name)}
                count={d.count}
                percentage={d.percentage ?? 0}
              />
            ))}
          </div>

          <p className='pt-2 text-[length:var(--text-11)] font-semibold uppercase tracking-wider text-[var(--text-quaternary)]'>
            {t('share.operating_system')}
          </p>
          <div className='space-y-2'>
            {osList.slice(0, 5).map((os) => (
              <BreakdownRow
                key={os.name}
                name={localizeEnvName(os.name)}
                count={os.count}
                percentage={os.percentage ?? 0}
              />
            ))}
          </div>
        </>)}
      </div>
    </div>
  )
}

function localizeDeviceName(name: string): string {
  if (name === 'desktop') return t('share.device_desktop')
  if (name === 'mobile') return t('share.device_mobile')
  if (name === 'tablet') return t('share.device_tablet')
  return name
}
