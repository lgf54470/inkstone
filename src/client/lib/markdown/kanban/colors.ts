import type { CSSProperties } from 'react'
import type { KanbanColorName, KanbanOption } from './types'

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
  'coral',
  'teal',
  'slate',
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

export function getDeterministicTagColor(name: string): KanbanColorName {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  const colors: readonly KanbanColorName[] = ['blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'red', 'teal']
  return colors[Math.abs(hash) % colors.length]!
}

export function resolveKanbanTagColor(tag: string, options?: KanbanOption[]): KanbanColorName {
  const opt = options?.find((o) => o.id === tag || o.label === tag)
  return opt?.color ?? getDeterministicTagColor(tag)
}
