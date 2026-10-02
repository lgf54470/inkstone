import { useEffect, useId, type ElementType, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowRight, ChevronRight, Filter, Info, Network, X } from 'lucide-react'
import { LIMITS } from '@shared/constants'
import type { Folder, Tag } from '@shared/types'
import {
  GRAPH_APPEARANCE_TOGGLES,
  GRAPH_CLEAR_TOGGLES,
  GRAPH_DEPTHS,
  GRAPH_SHOW_TOGGLES,
  type GraphPreferences,
  type GroupBy,
} from '../../../lib/graph-settings'
import { Button, IconButton } from '../../../components/primitives'
import { Select, Switch } from '../../../components/form'
import { Tooltip, useEscape } from '../../../components/overlay'
import { useBreakpoint } from '../../../lib/hooks'
import { t } from '../../../lib/i18n'
import { GRAPH_LIMIT_STEP } from './constants'
import { GraphColorRules } from './settings-color-rules'

interface GraphSettingsPanelProps {
  prefs: GraphPreferences
  onChange: <K extends keyof GraphPreferences>(key: K, value: GraphPreferences[K]) => void
  folders: Folder[]
  tags: Tag[]
  selectedTags: string[]
  isLimitOpen: boolean
  onToggleLimit: () => void
  onClose: () => void
  onResetTagFilters: () => void
  onRestoreDefaults: () => void
  /** Named by the header control that opens this drawer, so `aria-controls` has something to point at. */
  drawerId: string
}

export function GraphSettingsPanel({ prefs, onChange, folders, tags, selectedTags, isLimitOpen, onToggleLimit, onClose, onResetTagFilters, onRestoreDefaults, drawerId }: GraphSettingsPanelProps) {
  useEscape(true, onClose)
  const isOverCanvas = useBreakpoint() === 'mobile'
  useEffect(() => {
    // Opening a panel has to take focus into it: left where it was, the next Tab walks the header and
    // the drawer the reader just asked for is skipped entirely. The id is the one the header control
    // points `aria-controls` at, so both name the same element.
    document.getElementById(drawerId)?.focus({ preventScroll: true })
  }, [drawerId])
  // `dialog` is not an allowed role on `aside` (the overlay Drawer reads the same rule off axe), so the
  // shell that covers the canvas is a div; beside the canvas this is a named region, not a dialog.
  const DrawerShell: ElementType = isOverCanvas ? 'div' : 'aside'
  return (
    <>
      <div className='anim-fade absolute inset-0 z-[var(--z-sticky)] bg-[var(--scrim)] md:hidden' onClick={onClose} aria-hidden='true'/>
      <DrawerShell id={drawerId} role={isOverCanvas ? 'dialog' : 'region'} aria-modal={isOverCanvas || undefined} tabIndex={-1} aria-label={t('graph.settings')} className='absolute inset-y-0 right-0 z-[var(--z-sticky)] w-[min(88vw,300px)] overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 shadow-[var(--shadow-edge)] md:static md:shadow-none'>
        <div className='mb-4 flex items-center justify-between'><h3 className='text-[length:var(--text-13)] font-semibold'>{t('graph.settings')}</h3><Tooltip label={t('common.close')}><IconButton size='sm' label={t('common.close')} onClick={onClose}><X size={14}/></IconButton></Tooltip></div>
        <GraphFilterSection prefs={prefs} onChange={onChange} folders={folders} tags={tags} selectedTags={selectedTags} isLimitOpen={isLimitOpen} onToggleLimit={onToggleLimit} onResetTagFilters={onResetTagFilters}/>
        <GraphSection icon={<Network size={13}/>} title={t('graph.appearance')}>
          <GraphSelect label={t('graph.group_by')} value={prefs.groupBy} onChange={(value) => onChange('groupBy', value as GroupBy)} options={[['none', t('graph.group_none')], ['folder', t('graph.folder')], ['tag', t('graph.tag')]]}/>
          <GraphColorRules groups={prefs.colorGroups} onChange={(value) => onChange('colorGroups', value)}/>
          {GRAPH_APPEARANCE_TOGGLES.map((control) => (
            <GraphToggle key={control.prefKey} label={t(control.labelKey)} checked={prefs[control.prefKey]} onChange={(value) => onChange(control.prefKey, value)}/>
          ))}
        </GraphSection>
        <GraphSection icon={<ArrowRight size={13}/>} title={t('graph.forces')}>
          <GraphRange label={t('graph.repulsion')} min={300} max={1800} step={50} value={prefs.repulsion} onChange={(value) => onChange('repulsion', value)}/>
          <GraphRange label={t('graph.link_distance')} min={40} max={150} step={5} value={prefs.linkDistance} onChange={(value) => onChange('linkDistance', value)}/>
          <GraphRange label={t('graph.node_size')} min={0.7} max={1.8} step={0.1} value={prefs.nodeScale} onChange={(value) => onChange('nodeScale', value)}/>
          <Button type='button' variant='secondary' size='sm' onClick={onRestoreDefaults} className="mt-1 flex h-8 w-full items-center justify-center gap-2 text-[length:var(--text-11\.5)] text-[var(--text-secondary)]"><ArrowDownToLine size={13}/>{t('graph.restore_defaults')}</Button>
        </GraphSection>
      </DrawerShell>
    </>
  )
}

interface GraphFilterSectionProps {
  prefs: GraphPreferences
  onChange: <K extends keyof GraphPreferences>(key: K, value: GraphPreferences[K]) => void
  folders: Folder[]
  tags: Tag[]
  selectedTags: string[]
  isLimitOpen: boolean
  onToggleLimit: () => void
  onResetTagFilters: () => void
}

/** Everything that narrows which notes are in the graph, plus the cap notice the sidebar selection hits. */
function GraphFilterSection({ prefs, onChange, folders, tags, selectedTags, isLimitOpen, onToggleLimit, onResetTagFilters }: GraphFilterSectionProps) {
  return (
    <GraphSection icon={<Filter size={13}/>} title={t('graph.filters')}>
      <GraphSelect label={t('graph.folder')} value={prefs.folderId} onChange={(value) => onChange('folderId', value)} options={[['', t('graph.all_folders')], ...folders.map((folder) => [folder.id, folder.name] as [string, string])]}/>
      <GraphSelect label={t('graph.tag')} value={prefs.tag} onChange={(value) => onChange('tag', value)} options={[['', t('graph.all_tags')], ...tags.map((item) => [item.name, item.name] as [string, string])]}/>
      {(prefs.tag || selectedTags.length > 0) && <GraphSelect label={t('graph.tags_match')} value={prefs.tagsMatch} onChange={(value) => onChange('tagsMatch', value as 'any' | 'all')} options={[['any', t('graph.tags_match_any')], ['all', t('graph.tags_match_all')]]}/>}
      {selectedTags.length > 0 && <p className='text-[length:var(--text-11)] leading-relaxed text-[var(--text-quaternary)]'>{t('graph.sidebar_tags_included', { value0: selectedTags.length, value1: prefs.tagsMatch === 'all' ? t('graph.tags_match_all') : t('graph.tags_match_any') })}</p>}
      {GRAPH_CLEAR_TOGGLES.map((control) => (
        <GraphToggle key={control.prefKey} label={t(control.labelKey)} hint={control.hintKey ? t(control.hintKey) : undefined} checked={prefs[control.prefKey]} onChange={(value) => onChange(control.prefKey, value)}/>
      ))}
      {selectedTags.length >= LIMITS.tagSelectionMax && <div>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-[length:var(--text-11)] font-medium leading-relaxed text-[var(--danger)]'>{t('tags.selection_limit', { value0: LIMITS.tagSelectionMax })}</p>
          <Button type='button' variant='ghost' size='sm' onClick={onResetTagFilters} className='h-6 shrink-0 px-1.5 text-[length:var(--text-11)] font-medium text-[var(--accent)] hover:bg-transparent hover:underline'>{t('common.clear_selection')}</Button>
        </div>
        <Button type='button' variant='ghost' size='sm' onClick={onToggleLimit} className="mt-1 h-6 gap-1 px-1 text-[length:var(--text-10\.5)] font-medium text-[var(--text-quaternary)] hover:bg-transparent hover:text-[var(--text-secondary)]">
          <ChevronRight size={10} className={'transition-transform duration-[var(--dur-fast)] ' + (isLimitOpen ? 'rotate-90' : '')}/>
          {isLimitOpen ? t('common.collapse') : t('graph.tags_limit_more', { value0: LIMITS.tagSelectionMax })}
        </Button>
        {isLimitOpen && <p className="mt-1 text-[length:var(--text-10\.5)] leading-relaxed text-[var(--text-tertiary)]">{t('graph.tags_limit_detail', { value0: LIMITS.tagSelectionMax })}</p>}
      </div>}
      {GRAPH_SHOW_TOGGLES.map((control) => (
        <GraphToggle key={control.prefKey} label={t(control.labelKey)} checked={prefs[control.prefKey]} onChange={(value) => onChange(control.prefKey, value)}/>
      ))}
      <GraphRange label={t('graph.node_limit')} min={LIMITS.graphNodeLimitMin} max={LIMITS.graphNodeLimitMax} step={GRAPH_LIMIT_STEP} value={prefs.limit} onChange={(value) => onChange('limit', value)}/>
      {prefs.mode === 'local' && <GraphSelect label={t('graph.depth')} value={String(prefs.depth)} onChange={(value) => onChange('depth', Number(value))} options={GRAPH_DEPTHS.map((depth) => [String(depth), String(depth)] as [string, string])}/>}
    </GraphSection>
  )
}

function GraphSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className='mb-5'><h4 className='mb-2 flex items-center gap-1.5 text-[length:var(--text-11)] font-semibold uppercase tracking-[var(--tracking-label)] text-[var(--text-quaternary)]'>{icon}{title}</h4><div className='space-y-2.5'>{children}</div></section>
}

function GraphSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className='flex items-center justify-between gap-3 text-[length:var(--text-12)] text-[var(--text-secondary)]'>
      <span>{label}</span>
      <Select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 max-w-40 text-[length:var(--text-11\.5)]">
        {options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}
      </Select>
    </label>
  )
}

function GraphToggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  const hintId = useId()
  return (
    <div className='flex items-center justify-between gap-3 text-[length:var(--text-12)] text-[var(--text-secondary)]'>
      <span className='flex min-w-0 items-center gap-1'>
        <span className='truncate'>{label}</span>
        {hint && (
          <Tooltip label={hint}>
            <span role='img' aria-label={hint} id={hintId} className='inline-flex shrink-0 text-[var(--text-quaternary)]'>
              <Info size={11} />
            </span>
          </Tooltip>
        )}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} aria-describedby={hint ? hintId : undefined} />
    </div>
  )
}

function GraphRange({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return <label className='block text-[length:var(--text-12)] text-[var(--text-secondary)]'><span className='mb-1 flex justify-between'><span>{label}</span><span className='tabular-nums text-[var(--text-quaternary)]'>{value}</span></span><input type='range' min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className='w-full accent-[var(--accent)]'/></label>
}

