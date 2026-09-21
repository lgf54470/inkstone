import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'
import { Bot, Globe, Info, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react'
import { Switch } from '../../components/form'
import { Button } from '../../components/primitives'
import { useClickOutside, useEscape } from '../../components/overlay'
import { usePanelPlacement, type PanelPlacement } from '../../components/popover-placement'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useShareStore } from './share-store'

const PANEL_WIDTH = 320
/** What the panel is before it is measured; the first frame is hidden, so this only seeds the math. */
const PANEL_HEIGHT_ESTIMATE = 268

/**
 * The traffic filters, as a dialog anchored to the control that opens it. It is placed by the
 * shared panel math (`popover-placement`) rather than by `absolute right-0 top-full`: the panel is
 * 320px wide and its control can sit anywhere in a wrapping header, so on a 360px-wide phone the
 * old rule drew its first field off screen. It is portaled for the same reason the other panels are
 * — `fixed` resolves against a transformed ancestor, and the modal it can live in animates.
 *
 * The keyboard contract is a non-modal dialog's: the panel takes the focus when it opens, Escape
 * (or a press outside) closes it, and the focus goes back to the button that opened it.
 */
export function ShareTrafficFilterPopover() {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)

  const close = () => {
    setIsOpen(false)
    buttonRef.current?.focus()
  }
  useClickOutside([buttonRef, panelRef], isOpen, close)
  useEscape(isOpen, close)
  const placement = usePanelBox(isOpen, buttonRef, panelRef)
  useFocusOnOpen(isOpen, panelRef)

  const { tone, label } = filterBadge(excludeBots, excludeSelfReferrers, excludeOwner)

  return (
    <>
      <FilterTrigger
        buttonRef={buttonRef}
        isOpen={isOpen}
        isFilteringBots={excludeBots}
        tone={tone}
        label={label}
        onToggle={() => setIsOpen((prev) => !prev)}
      />
      {isOpen && <FilterPanelSurface panelRef={panelRef} placement={placement} />}
    </>
  )
}

interface FilterTriggerProps {
  buttonRef: RefObject<HTMLButtonElement | null>
  isOpen: boolean
  isFilteringBots: boolean
  tone: string
  label: string
  onToggle: () => void
}

/** The control the filters hang from: it wears the state it stands for, and names the panel. */
function FilterTrigger({ buttonRef, isOpen, isFilteringBots, tone, label, onToggle }: FilterTriggerProps) {
  return (
    <Button
      ref={buttonRef}
      variant='ghost'
      size='sm'
      icon={isFilteringBots ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
      onClick={onToggle}
      title={t('share.filter_traffic_title')}
      // The visible part of this control is the state it reports (a badge, and on a phone that is
      // all there is room for), so the name it is announced by is the panel it opens.
      aria-label={t('share.filter_traffic_title')}
      aria-haspopup='dialog'
      aria-expanded={isOpen}
      className={cn('h-7 gap-1.5 rounded-[var(--r-md)] border px-2 text-[length:var(--text-12)] font-medium', tone)}
    >
      <span className='hidden sm:inline'>{label}</span>
    </Button>
  )
}

/** The panel itself, portaled to the document so `fixed` placement is measured against the page. */
function FilterPanelSurface({ panelRef, placement }: { panelRef: RefObject<HTMLDivElement | null>; placement: PanelPlacement | null }) {
  return createPortal(
    <div
      ref={panelRef}
      role='dialog'
      aria-label={t('share.filter_traffic_title')}
      tabIndex={-1}
      style={{
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        width: PANEL_WIDTH,
        transformOrigin: placement?.origin,
      }}
      className={cn('anim-pop fixed z-[var(--z-popover)] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-4 shadow-[var(--shadow-float)] outline-none', !placement && 'invisible')}
    >
      <TrafficFilterPanel />
    </div>,
    document.body,
  )
}

/**
 * The panel's box: the shared placement math, fed with the height the panel really turned out to
 * be. The estimate seeds the first frame (which is drawn hidden), then the measurement decides
 * whether the panel fits under its control.
 */
function usePanelBox(
  isOpen: boolean,
  anchor: RefObject<HTMLButtonElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
): PanelPlacement | null {
  const [placement, setPlacement] = useState<PanelPlacement | null>(null)
  const [height, setHeight] = useState(PANEL_HEIGHT_ESTIMATE)
  usePanelPlacement(isOpen, { anchor, size: { width: PANEL_WIDTH, height }, apply: setPlacement })
  useLayoutEffect(() => {
    if (!isOpen)
      return
    const measured = panelRef.current?.offsetHeight
    if (measured && measured !== height) setHeight(measured)
  }, [isOpen, height, panelRef])
  return placement
}

/** The keyboard half of a non-modal dialog: the panel takes the focus once it is on screen. */
function useFocusOnOpen(isOpen: boolean, panelRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    if (!isOpen)
      return
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen, panelRef])
}

/** The colour and wording the closed control wears, read off the three switches it stands for. */
function filterBadge(excludeBots: boolean, excludeSelfReferrers: boolean, excludeOwner: boolean): { tone: string; label: string } {
  const isAllTraffic = !excludeBots && !excludeSelfReferrers && !excludeOwner
  const tone = excludeBots
    ? 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--success)] hover:bg-[var(--bg-hover)]'
    : isAllTraffic
      ? 'border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]'
      : 'border-[var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--warning)]'
  const label = excludeBots
    ? t('share.filter_real_visitors_badge')
    : isAllTraffic
      ? t('share.filter_all_traffic_badge')
      : t('share.filter_custom_traffic_badge')
  return { tone, label }
}

function TrafficFilterPanel() {
  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)
  const setFilters = useShareStore((s) => s.setFilters)

  return (
    <>
      <div className='flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]'>
        <div className='flex items-center gap-2'>
          <ShieldCheck size={16} className='text-[var(--accent)]' />
          <div className='font-semibold text-[length:var(--text-13)] text-[var(--text-primary)]'>
            {t('share.filter_traffic_title')}
          </div>
        </div>
      </div>

      <p className='py-2 text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)]'>
        {t('share.filter_traffic_desc')}
      </p>

      <div className='space-y-3 pt-2'>
        <TrafficFilterRow icon={<Bot size={15} className='mt-0.5 text-[var(--accent)] shrink-0' />} title={t('share.filter_bots_title')} desc={t('share.filter_bots_desc')} checked={excludeBots} onChange={(checked) => setFilters({ excludeBots: checked })} />
        <TrafficFilterRow icon={<Globe size={15} className='mt-0.5 text-[var(--accent)] shrink-0' />} title={t('share.filter_self_title')} desc={t('share.filter_self_desc')} checked={excludeSelfReferrers} onChange={(checked) => setFilters({ excludeSelfReferrers: checked })} />
        <TrafficFilterRow icon={<UserCheck size={15} className='mt-0.5 text-[var(--accent)] shrink-0' />} title={t('share.filter_owner_title')} desc={t('share.filter_owner_desc')} checked={excludeOwner} onChange={(checked) => setFilters({ excludeOwner: checked })} />
      </div>

      <div className="mt-3.5 flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--bg-card)] p-2 text-[length:var(--text-10\.5)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
        <Info size={12} className='text-[var(--accent)] shrink-0' />
        <span>{t('share.filter_persist_hint')}</span>
      </div>
    </>
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
    <div className='flex items-center justify-between gap-3'>
      <div className='flex items-start gap-2'>
        {icon}
        <div>
          <div className='text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
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
        label={title}
      />
    </div>
  )
}
