import { useId, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowRight, ChevronRight, Filter, Info, Network, X } from 'lucide-react'
import { LIMITS } from '@shared/constants'
import type { Folder, Tag } from '@shared/types'
import {
  GRAPH_APPEARANCE_TOGGLES,
  GRAPH_CLEAR_TOGGLES,
  GRAPH_SHOW_TOGGLES,
  type GraphPreferences,
  type GroupBy,
} from '../../../lib/graph-settings'
import { IconButton } from '../../../components/primitives'
import { Tooltip } from '../../../components/overlay'
import { t } from '../../../lib/i18n'

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
}

export function GraphSettingsPanel({ prefs, onChange, folders, tags, selectedTags, isLimitOpen, onToggleLimit, onClose, onResetTagFilters, onRestoreDefaults }: GraphSettingsPanelProps) {
  return (
      <aside aria-label={t('graph.settings')} className="absolute inset-y-0 right-0 z-[var(--z-sticky)] w-[min(88vw,300px)] overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 shadow-[-8px_0_24px_rgba(0,0,0,.06)] md:static md:shadow-none">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[length:var(--text-13)] font-semibold">{t('graph.settings')}</h3><Tooltip label={t('common.close')}><IconButton size="sm" label={t('common.close')} onClick={onClose}><X size={14}/></IconButton></Tooltip></div>
        <GraphSection icon={<Filter size={13}/>} title={t('graph.filters')}>
          <GraphSelect label={t('graph.folder')} value={prefs.folderId} onChange={(value) => onChange('folderId', value)} options={[['', t('graph.all_folders')], ...folders.map((folder) => [folder.id, folder.name] as [string, string])]}/>
          <GraphSelect label={t('graph.tag')} value={prefs.tag} onChange={(value) => onChange('tag', value)} options={[['', t('graph.all_tags')], ...tags.map((item) => [item.name, item.name] as [string, string])]}/>
          {(prefs.tag || selectedTags.length > 0) && <GraphSelect label={t('graph.tags_match')} value={prefs.tagsMatch} onChange={(value) => onChange('tagsMatch', value as 'any' | 'all')} options={[['any', t('graph.tags_match_any')], ['all', t('graph.tags_match_all')]]}/>}
          {selectedTags.length > 0 && <p className="text-[length:var(--text-11)] leading-relaxed text-[var(--text-quaternary)]">{t('graph.sidebar_tags_included', { value0: selectedTags.length, value1: prefs.tagsMatch === 'all' ? t('graph.tags_match_all') : t('graph.tags_match_any') })}</p>}
      {GRAPH_CLEAR_TOGGLES.map((control) => (
        <GraphToggle key={control.prefKey} label={t(control.labelKey)} hint={control.hintKey ? t(control.hintKey) : undefined} checked={prefs[control.prefKey]} onChange={(value) => onChange(control.prefKey, value)}/>
      ))}
          {selectedTags.length >= LIMITS.tagSelectionMax && <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[length:var(--text-11)] font-medium leading-relaxed text-[var(--danger)]">{t('tags.selection_limit', { value0: LIMITS.tagSelectionMax })}</p>
                <button type="button" onClick={onResetTagFilters} className="shrink-0 text-[length:var(--text-11)] font-medium text-[var(--accent)] transition-colors hover:underline">{t('common.clear_selection')}</button>
              </div>
              <button type="button" onClick={onToggleLimit} className="mt-1 flex items-center gap-1 text-[length:var(--text-10\.5)] font-medium text-[var(--text-quaternary)] transition-colors hover:text-[var(--text-secondary)]">
                <ChevronRight size={10} className={'transition-transform duration-[var(--dur-fast)] ' + (isLimitOpen ? 'rotate-90' : '')}/>
                {isLimitOpen ? t('common.collapse') : t('graph.tags_limit_more', { value0: LIMITS.tagSelectionMax })}
              </button>
              {isLimitOpen && <p className="mt-1 text-[length:var(--text-10\.5)] leading-relaxed text-[var(--text-tertiary)]">{t('graph.tags_limit_detail', { value0: LIMITS.tagSelectionMax })}</p>}
            </div>}
          {GRAPH_SHOW_TOGGLES.map((control) => (
            <GraphToggle key={control.prefKey} label={t(control.labelKey)} checked={prefs[control.prefKey]} onChange={(value) => onChange(control.prefKey, value)}/>
          ))}
          {prefs.mode === 'local' && <GraphSelect label={t('graph.depth')} value={String(prefs.depth)} onChange={(value) => onChange('depth', Number(value))} options={[["1", '1'], ["2", '2'], ["3", '3']]}/>} 
        </GraphSection>
        <GraphSection icon={<Network size={13}/>} title={t('graph.appearance')}>
          <GraphSelect label={t('graph.group_by')} value={prefs.groupBy} onChange={(value) => onChange('groupBy', value as GroupBy)} options={[["none", t('graph.group_none')], ["folder", t('graph.folder')], ["tag", t('graph.tag')]]}/>
          {GRAPH_APPEARANCE_TOGGLES.map((control) => (
            <GraphToggle key={control.prefKey} label={t(control.labelKey)} checked={prefs[control.prefKey]} onChange={(value) => onChange(control.prefKey, value)}/>
          ))}
        </GraphSection>
        <GraphSection icon={<ArrowRight size={13}/>} title={t('graph.forces')}>
          <GraphRange label={t('graph.repulsion')} min={300} max={1800} step={50} value={prefs.repulsion} onChange={(value) => onChange('repulsion', value)}/>
          <GraphRange label={t('graph.link_distance')} min={40} max={150} step={5} value={prefs.linkDistance} onChange={(value) => onChange('linkDistance', value)}/>
          <GraphRange label={t('graph.node_size')} min={0.7} max={1.8} step={0.1} value={prefs.nodeScale} onChange={(value) => onChange('nodeScale', value)}/>
          <button type="button" onClick={onRestoreDefaults} className="mt-1 flex h-8 w-full items-center justify-center gap-2 rounded-[var(--r-md)] border border-[var(--border-default)] text-[length:var(--text-11\.5)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"><ArrowDownToLine size={13}/>{t('graph.restore_defaults')}</button>
        </GraphSection>
      </aside>
  )
}

function GraphSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="mb-5"><h4 className="mb-2 flex items-center gap-1.5 text-[length:var(--text-11)] font-semibold uppercase tracking-[.06em] text-[var(--text-quaternary)]">{icon}{title}</h4><div className="space-y-2.5">{children}</div></section>
}

function GraphSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="flex items-center justify-between gap-3 text-[length:var(--text-12)] text-[var(--text-secondary)]"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 max-w-[160px] rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-inset)] px-2 text-[length:var(--text-11\.5)] outline-none focus:border-[var(--accent)]">{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select></label>
}

function GraphToggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  const hintId = useId()
  return <label className="flex cursor-pointer items-center justify-between gap-3 text-[length:var(--text-12)] text-[var(--text-secondary)]"><span className="flex min-w-0 items-center gap-1"><span className="truncate">{label}</span>{hint && <Tooltip label={hint}><span role="img" aria-label={hint} id={hintId} className="inline-flex shrink-0 text-[var(--text-quaternary)]"><Info size={11}/></span></Tooltip>}</span><input type="checkbox" aria-describedby={hint ? hintId : undefined} checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[var(--accent)]"/></label>
}

function GraphRange({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return <label className="block text-[length:var(--text-12)] text-[var(--text-secondary)]"><span className="mb-1 flex justify-between"><span>{label}</span><span className="tabular-nums text-[var(--text-quaternary)]">{value}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[var(--accent)]"/></label>
}

