import { useMemo } from 'react'
import { Tag } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanColorName, KanbanItem, KanbanProperty } from '../types'

interface KanbanTagFilterBarProps {
  tagsColumn?: KanbanProperty
  items: KanbanItem[]
  selectedTags?: string[]
  onToggleTag?: (tag: string) => void
  onClearTags?: () => void
}

function countTags(items: KanbanItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const tags = Array.isArray(item.properties.tags) ? (item.properties.tags as string[]) : []
    const subtaskTags = item.subtasks?.flatMap((st) => st.tags || []) || []
    const combined = new Set([...tags, ...subtaskTags])
    for (const tag of combined) {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  return counts
}

function buildTagList(tagsColumn?: KanbanProperty, counts = new Map<string, number>()) {
  const options = tagsColumn?.options || []
  const list: { id: string; label: string; color?: KanbanColorName; count: number }[] = []
  for (const opt of options) {
    list.push({
      id: opt.id,
      label: opt.label,
      color: opt.color,
      count: counts.get(opt.id) || counts.get(opt.label) || 0,
    })
  }
  for (const [tag, count] of counts.entries()) {
    if (!list.some((x) => x.id === tag || x.label === tag)) {
      list.push({ id: tag, label: tag, count })
    }
  }
  return list
}

export function KanbanTagFilterBar({
  tagsColumn,
  items,
  selectedTags = [],
  onToggleTag,
  onClearTags,
}: KanbanTagFilterBarProps) {
  const tagList = useMemo(() => {
    const counts = countTags(items)
    return buildTagList(tagsColumn, counts)
  }, [tagsColumn, items])

  if (tagList.length === 0 || !onToggleTag) return null

  return (
    <div className='flex flex-wrap items-center gap-1.5 pt-1 text-[length:var(--text-11)]'>
      <span className='flex items-center gap-1 text-[var(--text-tertiary)]'>
        <Tag size={12} />
        <span>{t('preview.kanban_prop_tags')}:</span>
      </span>
      {/* An unselected chip is not dimmed: at 70% opacity the label measured 2.95:1 on its own tint
          over the board's header surface (axe, light theme), and a control a person can press has to
          be readable — WCAG's exemption is for inactive components. Selected and unselected differ by
          the ring and the weight instead, and the count is painted in the chip's own colour rather
          than at 75% of it. */}
      {tagList.map((tagItem) => {
        const isSelected = selectedTags.includes(tagItem.id) || selectedTags.includes(tagItem.label)
        const style = getKanbanTagStyle(tagItem.color || 'blue')
        return (
          <button
            key={tagItem.id}
            type='button'
            onClick={() => onToggleTag(tagItem.id)}
            style={style}
            className={`inline-flex items-center gap-1 rounded-[var(--r-xs)] px-2 py-0.5 font-medium transition-all ${
              isSelected ? 'ring-2 ring-[var(--accent)] shadow-2xs font-semibold' : 'hover:brightness-95'
            }`}
          >
            <span>{formatKanbanOptionLabel(tagItem.label, 'tags')}</span>
            <span className='text-[length:var(--text-10)]'>({tagItem.count})</span>
          </button>
        )
      })}
      {selectedTags.length > 0 && onClearTags && (
        <button
          type='button'
          onClick={onClearTags}
          className='rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          {t('common.clear')}
        </button>
      )}
    </div>
  )
}
