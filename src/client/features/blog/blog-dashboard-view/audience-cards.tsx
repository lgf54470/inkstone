import type { ReactNode } from 'react'
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
    return (<>
        <GeographyCard analytics={analytics} locale={locale} />
        <TrafficSourcesCard analytics={analytics} />
        <DevicesCard analytics={analytics} />
    </>)
}

function AudienceCard({ icon, title, trailing, children }: { icon: ReactNode; title: string; trailing?: ReactNode; children: ReactNode }) {
    return (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                    {icon}
                    {title}
                </h3>
                {trailing !== undefined && <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">{trailing}</span>}
            </div>
            <div className="space-y-2.5 pt-3">{children}</div>
        </div>
    )
}

function NoVisitData() {
    return (<p className="py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">{t('blog.no_visit_data')}</p>)
}

function GeographyCard({ analytics, locale }: { analytics: BlogGlobalAnalytics | null; locale: string }) {
    const countries = analytics?.topCountries ?? []
    return (
        <AudienceCard icon={<Globe2 size={15} className="text-[var(--accent)]" />} title={t('blog.visitor_geography')} trailing={countries.length}>
            {countries.length === 0 ? <NoVisitData /> : countries.map((item) => (
                <BreakdownRow key={item.name} name={countryNameLocalized(item.name, locale)} flag={countryFlag(item.name)} count={item.count} percentage={item.percentage ?? 0} />
            ))}
        </AudienceCard>
    )
}

function TrafficSourcesCard({ analytics }: { analytics: BlogGlobalAnalytics | null }) {
    const referrers = analytics?.topReferrers ?? []
    return (
        <AudienceCard icon={<Compass size={15} className="text-[var(--accent)]" />} title={t('blog.traffic_sources')} trailing={referrers.length}>
            {referrers.length === 0 ? <NoVisitData /> : referrers.map((item) => (
                <BreakdownRow key={item.name} name={item.name} count={item.count} percentage={item.percentage ?? 0} />
            ))}
        </AudienceCard>
    )
}

function DevicesCard({ analytics }: { analytics: BlogGlobalAnalytics | null }) {
    const devices = analytics?.devices ?? []
    const osList = analytics?.osList.slice(0, 5) ?? []
    return (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Laptop size={15} className="text-[var(--accent)]" />
                    {t('blog.devices_and_os')}
                </h3>
            </div>
            <div className="space-y-3 pt-3">
                <DeviceSubheading label={t('blog.device_type')} />
                <div className="space-y-2">
                    {devices.map((device) => (
                        <BreakdownRow key={device.name} name={deviceNameOf(device.name)} count={device.count} percentage={device.percentage ?? 0} />
                    ))}
                </div>
                <DeviceSubheading label={t('blog.operating_system')} />
                <div className="space-y-2">
                    {osList.map((os) => (
                        <BreakdownRow key={os.name} name={os.name} count={os.count} percentage={os.percentage ?? 0} />
                    ))}
                </div>
            </div>
        </div>
    )
}

function DeviceSubheading({ label }: { label: string }) {
    return (<p className="pt-2 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] uppercase tracking-wider">{label}</p>)
}

function deviceNameOf(name: string): string {
    if (name === 'desktop') return t('share.device_desktop')
    if (name === 'mobile') return t('share.device_mobile')
    if (name === 'tablet') return t('share.device_tablet')
    return name
}
