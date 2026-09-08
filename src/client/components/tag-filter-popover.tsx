import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LIMITS } from '@shared/constants'
import { t } from '../lib/i18n'
import { sortTagsForPicker } from '../lib/tag-sort'
import { useNotes } from '../store/notes'
import { useUi } from '../store/ui'
import { useClickOutside, useEscape } from './overlay'
import { TagList, TagMatchToggle, TagPickerFooter, TagSearchInput } from './tag-filter-popover-views'
import { useHighlightScroll, usePopoverFocus, usePopoverPosition } from './use-tag-filter-popover'

const POPOVER_WIDTH = 236

/** Shared multi-tag picker: searchable tag checklist with note counts and an any/all match-mode switch. */
export function TagFilterPopover({ anchor, open, onClose, align = 'end' }: {
  anchor: React.RefObject<HTMLButtonElement | null>
  open: boolean
  onClose: () => void
  align?: 'start' | 'end'
}) {
  const tags = useNotes((s) => s.tags)
  const selectedTags = useUi((s) => s.selectedTags)
  const selectedTagsMatch = useUi((s) => s.selectedTagsMatch)
  const setSelectedTagsMatch = useUi((s) => s.setSelectedTagsMatch)
  const toggleTagSelection = useUi((s) => s.toggleTagSelection)
  const selectTags = useUi((s) => s.selectTags)
  const [query, setQuery] = useState('')
  const searching = query.trim() !== ''
  const atCap = selectedTags.length >= LIMITS.tagSelectionMax
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0, origin: 'top right' })
  const highlightedRef = useRef<HTMLButtonElement>(null)

  useEscape(open, onClose)
  useClickOutside(anchor ? [popoverRef, anchor] : [popoverRef], open, onClose)

  const visibleTags = useMemo(() => sortTagsForPicker(tags, query), [tags, query])
  usePopoverPosition(open, align, anchor, visibleTags.length, setPosition)
  usePopoverFocus(open, inputRef, setQuery)
  useHighlightScroll(query, highlightedRef)

  if (!open)
    return null
  const selectAll = () => {
    if (atCap) {
      useUi.getState().toast({ title: t('tags.selection_limit', { value0: LIMITS.tagSelectionMax }), tone: 'danger' })
      return
    }
    selectTags(visibleTags.map((tag) => tag.name))
    useUi.getState().toast({ title: t('sidebar.tags_selected', { value0: visibleTags.length }) })
  }
  return createPortal(<div ref={popoverRef} role='dialog' aria-label={t('command.filter_by_tags')} className='anim-pop fixed z-[var(--z-hover-card)] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]' style={{ top: position.top, left: position.left, width: POPOVER_WIDTH, transformOrigin: position.origin }}>
    <TagSearchInput inputRef={inputRef} value={query} onChange={setQuery}/>
    <TagMatchToggle match={selectedTagsMatch} onChange={setSelectedTagsMatch}/>
    <div className='mt-1.5 mb-1 h-px bg-[var(--border-subtle)]'/>
    <TagList tags={visibleTags} selectedTags={selectedTags} query={query} highlightedRef={highlightedRef} onToggle={toggleTagSelection}/>
    {visibleTags.length > 0 && <TagPickerFooter visibleCount={visibleTags.length} searching={searching} atCap={atCap} hasSelection={selectedTags.length > 0} onSelectAll={selectAll}/>}
  </div>, document.body)
}