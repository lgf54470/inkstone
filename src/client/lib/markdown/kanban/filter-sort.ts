import type {
  KanbanColorName,
  KanbanFilter,
  KanbanItem,
  KanbanProperty,
  KanbanSort,
} from './types'

function isValueEmpty(val: unknown): boolean {
  if (val === null || val === undefined || val === '') return true
  if (Array.isArray(val) && val.length === 0) return true
  return false
}

function matchesFilter(item: KanbanItem, filter: KanbanFilter): boolean {
  const { propertyId, operator, value = '' } = filter
  const itemVal = propertyId === 'title' ? item.title : item.properties[propertyId]

  switch (operator) {
    case 'is_empty':
      return isValueEmpty(itemVal)
    case 'is_not_empty':
      return !isValueEmpty(itemVal)
    case 'equals': {
      if (propertyId === 'tags') {
        const itemTags = Array.isArray(itemVal) ? (itemVal as string[]) : []
        const hasInItem = itemTags.some((t) => t.toLowerCase() === value.toLowerCase())
        const hasInSubtasks = item.subtasks?.some((st) =>
          st.tags?.some((t) => t.toLowerCase() === value.toLowerCase()),
        )
        return hasInItem || Boolean(hasInSubtasks)
      }
      if (Array.isArray(itemVal)) return itemVal.includes(value)
      return String(itemVal ?? '').toLowerCase() === value.toLowerCase()
    }
    case 'not_equals': {
      if (propertyId === 'tags') {
        const itemTags = Array.isArray(itemVal) ? (itemVal as string[]) : []
        const hasInItem = itemTags.some((t) => t.toLowerCase() === value.toLowerCase())
        const hasInSubtasks = item.subtasks?.some((st) =>
          st.tags?.some((t) => t.toLowerCase() === value.toLowerCase()),
        )
        return !hasInItem && !hasInSubtasks
      }
      if (Array.isArray(itemVal)) return !itemVal.includes(value)
      return String(itemVal ?? '').toLowerCase() !== value.toLowerCase()
    }
    case 'contains':
      return String(itemVal ?? '').toLowerCase().includes(value.toLowerCase())
    case 'not_contains':
      return !String(itemVal ?? '').toLowerCase().includes(value.toLowerCase())
    default:
      return true
  }
}

export function applyKanbanFilters(items: KanbanItem[], filters?: KanbanFilter[]): KanbanItem[] {
  if (!filters || filters.length === 0) return items
  return items.filter((item) => filters.every((filter) => matchesFilter(item, filter)))
}

export function applyKanbanSorts(items: KanbanItem[], sorts?: KanbanSort[]): KanbanItem[] {
  if (!sorts || sorts.length === 0) return items
  return [...items].sort((a, b) => {
    for (const sort of sorts) {
      const aVal = sort.propertyId === 'title' ? a.title : a.properties[sort.propertyId]
      const bVal = sort.propertyId === 'title' ? b.title : b.properties[sort.propertyId]
      if (aVal === bVal) continue
      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
      return sort.direction === 'asc' ? cmp : -cmp
    }
    return 0
  })
}

function itemMatchesQuery(item: KanbanItem, q: string): boolean {
  if (item.title.toLowerCase().includes(q)) return true
  if (item.description?.toLowerCase().includes(q)) return true
  if (item.content?.toLowerCase().includes(q)) return true
  for (const val of Object.values(item.properties)) {
    if (typeof val === 'string' && val.toLowerCase().includes(q)) return true
    if (Array.isArray(val) && val.some((v) => String(v).toLowerCase().includes(q))) return true
  }
  if (item.subtasks?.some((st) =>
    st.title.toLowerCase().includes(q) ||
    (st.description && st.description.toLowerCase().includes(q)) ||
    (st.tags && st.tags.some((t) => t.toLowerCase().includes(q))),
  )) {
    return true
  }
  return false
}

export function searchKanbanItems(items: KanbanItem[], query: string): KanbanItem[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return items
  return items.filter((item) => itemMatchesQuery(item, trimmed))
}

export interface KanbanGroup {
  groupKey: string
  label: string
  color?: KanbanColorName
  items: KanbanItem[]
}

// Documents imported from other tools may store the option label where this
// board expects the option id; matching only by id would hide all of those
// cards in No Status, so fall back to a case-insensitive label match.
function findGroupForValue(groups: KanbanGroup[], val: unknown): KanbanGroup | undefined {
  const byId = groups.find((g) => g.groupKey === val)
  if (byId) return byId
  if (typeof val !== 'string') return undefined
  const needle = val.toLowerCase()
  return groups.find((g) => g.label.toLowerCase() === needle)
}

export function groupKanbanItems(
  items: KanbanItem[],
  groupPropertyId: string,
  groupProperty?: KanbanProperty,
): KanbanGroup[] {
  const groups: KanbanGroup[] = []
  const options = groupProperty?.options ?? []

  for (const opt of options) {
    groups.push({
      groupKey: opt.id,
      label: opt.label,
      color: opt.color,
      items: [],
    })
  }

  const noGroupKey = '__none__'
  const noGroup: KanbanGroup = {
    groupKey: noGroupKey,
    label: 'No Status',
    color: 'gray',
    items: [],
  }

  for (const item of items) {
    const val = item.properties[groupPropertyId]
    const matched = findGroupForValue(groups, val)
    if (matched) {
      matched.items.push(item)
    } else {
      noGroup.items.push(item)
    }
  }

  if (noGroup.items.length > 0 || groups.length === 0) {
    groups.unshift(noGroup)
  }

  return groups
}
