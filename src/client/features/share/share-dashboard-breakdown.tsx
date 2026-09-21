import { Compass, Globe2, Laptop, Tag } from 'lucide-react'
import type { ShareGlobalAnalytics, ShareBreakdownItem } from '@shared/types'
import { isReservedChannelName } from '@shared/share-channel'
import { BreakdownRow } from '../../components/dashboard-blocks'
import { t } from '../../lib/i18n'
import { countryFlag, countryNameLocalized, localizeChannelName, localizeDeviceName, localizeEnvName, localizeReferrerName } from './share-helpers'
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

/**
 * How the traffic found the link, and — under it — which copy of the link it came from. The two sit
 * in one card because they answer one question ("where did this visit come from") at two levels:
 * the referrer says where the browser was, the channel says which link was followed, and the app
 * stores both because neither can stand in for the other (ADR-0004).
 */
export function ReferrerBreakdownCard({ analytics }: { analytics: ShareGlobalAnalytics | null }) {
  const topReferrers = analytics?.topReferrers ?? []
  const channels = analytics?.channels ?? []
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
      {channels.length > 0 && <ChannelSplit rows={channels} />}
    </div>
  )
}

/**
 * The channel split itself. The hint only appears while no marker has ever come back: that is the
 * moment the owner needs to learn the feature exists, and printing it afterwards would be noise on
 * every account that already uses it.
 */
function ChannelSplit({ rows }: { rows: ShareBreakdownItem[] }) {
  const hasMarker = rows.some((row) => !isReservedChannelName(row.name))
  return (
    <div className='mt-3 space-y-2.5 border-t border-[var(--border-subtle)] pt-3'>
      <p className='flex items-center gap-1.5 text-[length:var(--text-11)] font-semibold uppercase tracking-wider text-[var(--text-quaternary)]'>
        <Tag size={12} aria-hidden />
        {t('share.channel_section_title')}
      </p>
      {rows.map((row) => (
        <BreakdownRow
          key={row.name}
          name={localizeChannelName(row.name)}
          count={row.count}
          percentage={row.percentage ?? 0}
        />
      ))}
      {!hasMarker && <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('share.channel_hint')}</p>}
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
