import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Bot, Globe, Info, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react'
import { Switch } from '../../components/form'
import { useClickOutside, useEscape } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useBlogStore } from './blog-store'

function trafficBadgeKey(excludeBots: boolean, excludeSelfReferrers: boolean, excludeOwner: boolean) {
  if (excludeBots) return 'share.filter_real_visitors_badge'
  if (!excludeSelfReferrers && !excludeOwner) return 'share.filter_all_traffic_badge'
  return 'share.filter_custom_traffic_badge'
}

function trafficTone(excludeBots: boolean, excludeSelfReferrers: boolean, excludeOwner: boolean) {
  if (excludeBots)
    return 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--success)] hover:bg-[var(--bg-hover)]'
  if (!excludeSelfReferrers && !excludeOwner)
    return 'border-[var(--danger)]/30 bg-[var(--danger-subtle)] text-[var(--danger)]'
  return 'border-[var(--warning)]/30 bg-[var(--warning-subtle)] text-[var(--warning)]'
}

function TrafficToggleButton({ onToggle }: { onToggle: () => void }) {
  const excludeBots = useBlogStore((s) => s.excludeBots)
  const excludeSelfReferrers = useBlogStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useBlogStore((s) => s.excludeOwner)
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex h-7 items-center gap-1.5 rounded-[var(--r-md)] border px-2 text-[length:var(--text-12)] font-medium transition-colors ${trafficTone(excludeBots, excludeSelfReferrers, excludeOwner)}`}
      title={t('share.filter_traffic_title')}
    >
      {excludeBots ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
      <span className="hidden sm:inline">{t(trafficBadgeKey(excludeBots, excludeSelfReferrers, excludeOwner))}</span>
    </button>
  )
}

function FilterToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
}: {
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
          <div className="text-[length:var(--text-12)] font-medium text-[var(--text-primary)]">{title}</div>
          <div className="text-[length:var(--text-10\\.5)] text-[var(--text-quaternary)] leading-normal">{desc}</div>
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

function TrafficFilterRows() {
  const excludeBots = useBlogStore((s) => s.excludeBots)
  const excludeSelfReferrers = useBlogStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useBlogStore((s) => s.excludeOwner)
  const setFilters = useBlogStore((s) => s.setFilters)
  return (
    <div className="space-y-3 pt-2">
      <FilterToggleRow
        icon={<Bot size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />}
        title={t('share.filter_bots_title')}
        desc={t('share.filter_bots_desc')}
        checked={excludeBots}
        onChange={(checked) => setFilters({ excludeBots: checked })}
      />
      <FilterToggleRow
        icon={<Globe size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />}
        title={t('share.filter_self_title')}
        desc={t('share.filter_self_desc')}
        checked={excludeSelfReferrers}
        onChange={(checked) => setFilters({ excludeSelfReferrers: checked })}
      />
      <FilterToggleRow
        icon={<UserCheck size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />}
        title={t('share.filter_owner_title')}
        desc={t('share.filter_owner_desc')}
        checked={excludeOwner}
        onChange={(checked) => setFilters({ excludeOwner: checked })}
      />
    </div>
  )
}

function TrafficFilterPanel() {
  return (
    <div className="absolute right-0 top-full z-[var(--z-popover)] mt-1.5 w-80 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-float)]">
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

      <TrafficFilterRows />

      <div className="mt-3.5 flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--bg-card)] p-2 text-[length:var(--text-10\\.5)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
        <Info size={12} className="text-[var(--accent)] shrink-0" />
        <span>{t('share.filter_persist_hint')}</span>
      </div>
    </div>
  )
}

export function BlogTrafficFilterPopover() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside([containerRef], isOpen, () => setIsOpen(false))
  useEscape(isOpen, () => setIsOpen(false))

  return (
    <div ref={containerRef} className="relative">
      <TrafficToggleButton onToggle={() => setIsOpen((prev) => !prev)} />
      {isOpen && <TrafficFilterPanel />}
    </div>
  )
}
