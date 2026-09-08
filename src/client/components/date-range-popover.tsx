import { createPortal } from 'react-dom'
import { t } from '../lib/i18n'
import { useDateRangePopover, type DateRangePopoverProps } from './use-date-range-popover'
import { EndpointToggle, PresetBar, PresetEditor, RangeHint, RangeMonthGrid, RangePopoverHeader } from './date-range-popover-views'
export { movePresetInList, presetRange } from './date-range-popover-core'
export type { RangePreset } from './date-range-popover-core'

const POPOVER_WIDTH = 248

/** Floating editor for an inclusive date-range filter: pick a start or end endpoint on a mini month calendar, leap to nearby months, apply fixed or rolling quick ranges, or clear the range. */
export function DateRangePopover(props: DateRangePopoverProps) {
  const p = useDateRangePopover(props)
  if (!props.open)
    return null
  return createPortal(<div ref={p.popoverRef} role='dialog' aria-label={t('notes.range_editor_title')} className='anim-pop fixed z-[var(--z-hover-card)] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)]' style={{ top: p.position.top, left: p.position.left, width: POPOVER_WIDTH, transformOrigin: p.position.origin }}>
    <RangePopoverHeader monthTitle={p.monthTitle} onPrevMonth={() => p.shiftMonth(-1)} onNextMonth={() => p.shiftMonth(1)} onClear={() => p.onChange(null)}/>
    <EndpointToggle editing={p.editing} onSelect={p.selectEndpoint}/>
    <PresetBar presets={p.presets} isActivePreset={p.isActivePreset} onApplyPreset={p.applyPreset} onApplyRelative={p.onApplyRelative} isEditorOpen={p.isEditorOpen} onToggleEditor={() => p.setIsEditorOpen((open) => !open)}/>
    {p.isEditorOpen ? (<PresetEditor presets={p.presets} drag={p.drag} onUpdate={p.updatePreset} onRemove={p.removePreset} onAdd={p.addPreset} onClose={() => p.setIsEditorOpen(false)}/>) : (<>
      <RangeMonthGrid gridRef={p.gridRef} cursor={p.cursor} weekStart={p.weekStart} weekdayLabels={p.weekdayLabels} todayKey={p.todayKey} monthTitle={p.monthTitle} current={p.current} editing={p.editing} onPick={p.onPick}/>
      <RangeHint/>
    </>)}
  </div>, document.body)
}