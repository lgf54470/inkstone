import type { CSSProperties } from 'react'
import type { KanbanColorName } from './types'

export const KANBAN_COLOR_NAMES: readonly KanbanColorName[] = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const

export function getKanbanTagStyle(color?: KanbanColorName | string | null): CSSProperties {
  if (!color || !KANBAN_COLOR_NAMES.includes(color as KanbanColorName)) {
    return {
      backgroundColor: 'var(--bg-hover)',
      color: 'var(--text-secondary)',
      borderColor: 'var(--border-subtle)',
    }
  }
  const name = color as KanbanColorName
  return {
    backgroundColor: `var(--kanban-tag-${name}-bg)`,
    color: `var(--kanban-tag-${name}-fg)`,
    borderColor: `var(--kanban-tag-${name}-border, transparent)`,
  }
}

export function getKanbanDotColor(color?: KanbanColorName | string | null): string {
  if (!color || !KANBAN_COLOR_NAMES.includes(color as KanbanColorName)) {
    return 'var(--text-tertiary)'
  }
  return `var(--kanban-tag-${color}-fg)`
}
