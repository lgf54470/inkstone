import { useRef, useState } from 'react'
import { Bot, Globe, Info, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react'
import { Switch } from '../../components/form'
import { useClickOutside, useEscape } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useShareStore } from './share-store'

export function ShareTrafficFilterPopover() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)
  const setFilters = useShareStore((s) => s.setFilters)

  useClickOutside([buttonRef, panelRef], open, () => setOpen(false))
  useEscape(open, () => setOpen(false))

  const allFiltered = excludeBots && excludeSelfReferrers && excludeOwner
  const noneFiltered = !excludeBots && !excludeSelfReferrers && !excludeOwner

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-7 items-center gap-1.5 rounded-[var(--r-md)] border px-2 text-[12px] font-medium transition-colors ${
          allFiltered
            ? 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--success)] hover:bg-[var(--bg-hover)]'
            : noneFiltered
              ? 'border-[var(--danger)]/30 bg-[var(--danger-subtle)] text-[var(--danger)]'
              : 'border-[var(--warning)]/30 bg-[var(--warning-subtle)] text-[var(--warning)]'
        }`}
        title={t('share.filter_traffic_title')}
      >
        {allFiltered ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
        <span className="hidden sm:inline">
          {allFiltered
            ? t('share.filter_real_visitors_badge')
            : noneFiltered
              ? t('share.filter_all_traffic_badge')
              : t('share.filter_custom_traffic_badge')}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-50 mt-1.5 w-80 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-float)]"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-[var(--accent)]" />
              <div className="font-semibold text-[13px] text-[var(--text-primary)]">
                {t('share.filter_traffic_title')}
              </div>
            </div>
          </div>

          <p className="py-2 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
            {t('share.filter_traffic_desc')}
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <Bot size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />
                <div>
                  <div className="text-[12px] font-medium text-[var(--text-primary)]">
                    {t('share.filter_bots_title')}
                  </div>
                  <div className="text-[10.5px] text-[var(--text-quaternary)] leading-normal">
                    {t('share.filter_bots_desc')}
                  </div>
                </div>
              </div>
              <Switch
                checked={excludeBots}
                onChange={(checked) => setFilters({ excludeBots: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <Globe size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />
                <div>
                  <div className="text-[12px] font-medium text-[var(--text-primary)]">
                    {t('share.filter_self_title')}
                  </div>
                  <div className="text-[10.5px] text-[var(--text-quaternary)] leading-normal">
                    {t('share.filter_self_desc')}
                  </div>
                </div>
              </div>
              <Switch
                checked={excludeSelfReferrers}
                onChange={(checked) => setFilters({ excludeSelfReferrers: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <UserCheck size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />
                <div>
                  <div className="text-[12px] font-medium text-[var(--text-primary)]">
                    {t('share.filter_owner_title')}
                  </div>
                  <div className="text-[10.5px] text-[var(--text-quaternary)] leading-normal">
                    {t('share.filter_owner_desc')}
                  </div>
                </div>
              </div>
              <Switch
                checked={excludeOwner}
                onChange={(checked) => setFilters({ excludeOwner: checked })}
              />
            </div>
          </div>

          <div className="mt-3.5 flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--bg-card)] p-2 text-[10.5px] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
            <Info size={12} className="text-[var(--accent)] shrink-0" />
            <span>{t('share.filter_persist_hint')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
