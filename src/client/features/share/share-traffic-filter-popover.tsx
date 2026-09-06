import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Bot, Globe, Info, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react'
import { Switch } from '../../components/form'
import { useClickOutside, useEscape } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useShareStore } from './share-store'

export function ShareTrafficFilterPopover() {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)

  useClickOutside([buttonRef, panelRef], isOpen, () => setIsOpen(false))
  useEscape(isOpen, () => setIsOpen(false))

  const isFilteringBots = excludeBots
  const isAllTraffic = !excludeBots && !excludeSelfReferrers && !excludeOwner
  const tone = isFilteringBots
    ? 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--success)] hover:bg-[var(--bg-hover)]'
    : isAllTraffic
      ? 'border-[var(--danger)]/30 bg-[var(--danger-subtle)] text-[var(--danger)]'
      : 'border-[var(--warning)]/30 bg-[var(--warning-subtle)] text-[var(--warning)]'
  const label = isFilteringBots
    ? t('share.filter_real_visitors_badge')
    : isAllTraffic
      ? t('share.filter_all_traffic_badge')
      : t('share.filter_custom_traffic_badge')

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn('flex h-7 items-center gap-1.5 rounded-[var(--r-md)] border px-2 text-[length:var(--text-12)] font-medium transition-colors', tone)}
        title={t('share.filter_traffic_title')}
      >
        {isFilteringBots ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
        <span className="hidden sm:inline">{label}</span>
      </button>

      {isOpen && <TrafficFilterPanel panelRef={panelRef} />}
    </div>
  )
}

function TrafficFilterPanel({ panelRef }: {
  panelRef: React.RefObject<HTMLDivElement | null>
}) {
  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)
  const setFilters = useShareStore((s) => s.setFilters)

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-[var(--z-popover)] mt-1.5 w-80 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-float)]"
    >
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-[var(--accent)]" />
          <div className="font-semibold text-[length:var(--text-13)] text-[var(--text-primary)]">
            {t('share.filter_traffic_title')}
          </div>
        </div>
      </div>

      <p className="py-2 text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)]">
        {t('share.filter_traffic_desc')}
      </p>

      <div className="space-y-3 pt-2">
        <TrafficFilterRow icon={<Bot size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />} title={t('share.filter_bots_title')} desc={t('share.filter_bots_desc')} checked={excludeBots} onChange={(checked) => setFilters({ excludeBots: checked })} />
        <TrafficFilterRow icon={<Globe size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />} title={t('share.filter_self_title')} desc={t('share.filter_self_desc')} checked={excludeSelfReferrers} onChange={(checked) => setFilters({ excludeSelfReferrers: checked })} />
        <TrafficFilterRow icon={<UserCheck size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />} title={t('share.filter_owner_title')} desc={t('share.filter_owner_desc')} checked={excludeOwner} onChange={(checked) => setFilters({ excludeOwner: checked })} />
      </div>

      <div className="mt-3.5 flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--bg-card)] p-2 text-[length:var(--text-10\.5)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
        <Info size={12} className="text-[var(--accent)] shrink-0" />
        <span>{t('share.filter_persist_hint')}</span>
      </div>
    </div>
  )
}

function TrafficFilterRow({ icon, title, desc, checked, onChange }: {
  icon: ReactNode
  title: string
  desc: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-2">
        {icon}
        <div>
          <div className="text-[length:var(--text-12)] font-medium text-[var(--text-primary)]">
            {title}
          </div>
          <div className="text-[length:var(--text-10\.5)] text-[var(--text-quaternary)] leading-normal">
            {desc}
          </div>
        </div>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
      />
    </div>
  )
}