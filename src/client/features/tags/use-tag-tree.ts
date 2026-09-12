import { useMemo, useState } from 'react'
import type { Tag } from '@shared/types'
import { buildTagTree, flattenTagTree } from '../../lib/tag-tree'

const COLLAPSED_LIST_LIMIT = 10

export interface TagTreeState {
  nodes: ReturnType<typeof flattenTagTree>
  expandedPaths: ReadonlySet<string>
  allPaths: readonly string[]
  isListExpanded: boolean
  canToggle: boolean
  canToggleList: boolean
  listLength: number
  allExpanded: boolean
  togglePath: (path: string) => void
  toggleAll: () => void
  toggleList: () => void
}

export function useTagTree(tags: readonly Tag[]): TagTreeState {
  const [isListExpanded, setIsListExpanded] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
  const tree = useMemo(() => buildTagTree(tags), [tags])
  const flattened = useMemo(() => flattenTagTree(tree, expandedPaths), [tree, expandedPaths])
  const parentPaths = useMemo(() => collectParentPaths(tree), [tree])
  const allExpanded = (parentPaths.length === 0 || parentPaths.every((path) => expandedPaths.has(path)))
    && (isListExpanded || flattened.length <= COLLAPSED_LIST_LIMIT)
  return {
    nodes: isListExpanded ? flattened : flattened.slice(0, COLLAPSED_LIST_LIMIT),
    expandedPaths,
    isListExpanded,
    canToggle: parentPaths.length > 0 || flattened.length > COLLAPSED_LIST_LIMIT || tags.length > COLLAPSED_LIST_LIMIT,
    canToggleList: flattened.length > COLLAPSED_LIST_LIMIT,
    listLength: flattened.length,
    allPaths: parentPaths,
    allExpanded,
    togglePath: (path) => setExpandedPaths((previous) => toggleSetValue(previous, path)),
    toggleAll: () => {
      if (allExpanded) {
        setExpandedPaths(new Set())
        setIsListExpanded(false)
        return
      }
      setExpandedPaths(new Set(parentPaths))
      setIsListExpanded(true)
    },
    toggleList: () => setIsListExpanded((value) => !value),
  }
}

function collectParentPaths(tree: ReturnType<typeof buildTagTree>): string[] {
  const result: string[] = []
  const visit = (nodes: ReturnType<typeof buildTagTree>): void => {
    for (const node of nodes) {
      if (node.children.length === 0) continue
      result.push(node.fullPath)
      visit(node.children)
    }
  }
  visit(tree)
  return result
}

function toggleSetValue(previous: Set<string>, value: string): Set<string> {
  const next = new Set(previous)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}
