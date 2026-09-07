import { useMemo, useState } from 'react'
import { Check, FileText, LayoutTemplate, Search } from 'lucide-react'
import type { Folder, NoteTemplate } from '@shared/types'
import { Modal } from '../../components/overlay'
import { useNoteTemplates } from '../../store/note-templates'
import { getFolderTemplateId, setFolderTemplateId } from '../../lib/folder-prefs'
import { useUi } from '../../store/ui'
import { t } from '../../lib/i18n'

const MODAL_WIDTH = 480

function filterTemplates(templates: NoteTemplate[], query: string): NoteTemplate[] {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return templates
  return templates.filter(
    (template) =>
      template.name.toLocaleLowerCase().includes(q) ||
      (template.description && template.description.toLocaleLowerCase().includes(q)),
  )
}

function TemplateSearchField({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  return (
    <div className='relative'>
      <Search size={14} className='pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]' />
      <input
        type='search'
        placeholder={t('templates.search_templates')}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className='w-full rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] py-1.5 pl-8 pr-3 text-[length:var(--text-13)] outline-none transition-colors focus:border-[var(--accent)]'
      />
    </div>
  )
}

function NoTemplateOption({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <button
      type='button'
      onClick={onSelect}
      className='flex w-full items-center justify-between gap-2.5 rounded-[var(--r-md)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]'
    >
      <div className='flex items-center gap-2.5 min-w-0'>
        <span className='flex size-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-sunken)] text-[var(--text-tertiary)]'>
          <FileText size={14} />
        </span>
        <div className='min-w-0'>
          <div className='truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
            {t('folders.no_template')}
          </div>
        </div>
      </div>
      {selected && <Check size={14} className='shrink-0 text-[var(--accent)]' />}
    </button>
  )
}

function TemplateOptionRow({
  template,
  selected,
  onSelect,
}: {
  template: NoteTemplate
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      className='flex w-full items-center justify-between gap-2.5 rounded-[var(--r-md)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]'
    >
      <div className='flex items-center gap-2.5 min-w-0'>
        <span className='flex size-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--accent-soft)] text-[var(--accent)]'>
          <LayoutTemplate size={14} />
        </span>
        <div className='min-w-0'>
          <div className='truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>{template.name}</div>
          {template.description && (
            <div className='truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{template.description}</div>
          )}
        </div>
      </div>
      {selected && <Check size={14} className='shrink-0 text-[var(--accent)]' />}
    </button>
  )
}

export function FolderTemplateModal({
  folder,
  onClose,
}: {
  folder: Folder
  onClose: () => void
}) {
  const templates = useNoteTemplates((s) => s.templates)
  const toast = useUi((s) => s.toast)
  const currentTemplateId = getFolderTemplateId(folder.id)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => filterTemplates(templates, query), [templates, query])

  const handleSelect = (template: NoteTemplate | null) => {
    if (template === null) {
      setFolderTemplateId(folder.id, null)
      toast({ title: t('folders.template_unbound_toast'), tone: 'default' })
    } else {
      setFolderTemplateId(folder.id, template.id)
      toast({ title: t('folders.template_bound_toast', { value0: template.name }), tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('folders.default_template')} - ${folder.name}`}
      description={t('folders.bind_template')}
      width={MODAL_WIDTH}
    >
      <div className='space-y-3'>
        {templates.length > 4 && <TemplateSearchField query={query} onQueryChange={setQuery} />}

        <div className='max-h-[380px] overflow-y-auto space-y-1'>
          <NoTemplateOption selected={currentTemplateId === null} onSelect={() => handleSelect(null)} />
          {filtered.map((tmpl) => (
            <TemplateOptionRow
              key={tmpl.id}
              template={tmpl}
              selected={currentTemplateId === tmpl.id}
              onSelect={() => handleSelect(tmpl)}
            />
          ))}
        </div>
      </div>
    </Modal>
  )
}
