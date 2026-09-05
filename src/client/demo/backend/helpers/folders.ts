import type { Folder } from '@shared/types'
import type { DemoState } from '../../state'

export function demoFolderSiblings(
  state: DemoState,
  parentId: string | null,
  excludeId?: string,
): Folder[] {
  return [...state.folders.values()]
    .filter((folder) => folder.parentId === parentId && folder.id !== excludeId)
    .sort((left, right) => left.position - right.position || left.createdAt - right.createdAt || left.id.localeCompare(right.id))
}

export function availableDemoFolderName(siblings: Folder[], base: string): string {
  const names = new Set(siblings.map((folder) => folder.name.toLocaleLowerCase()))
  if (!names.has(base.toLocaleLowerCase())) return base
  let suffix = 2
  while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix++
  return `${base} ${suffix}`
}

export function demoFolderDepth(state: DemoState, id: string): number {
  let depth = 1
  let cursor = state.folders.get(id)?.parentId ?? null
  const visited = new Set([id])
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor)
    depth++
    cursor = state.folders.get(cursor)?.parentId ?? null
  }
  return depth
}

export function demoFolderHeight(state: DemoState, rootId: string): number {
  let height = 1
  const queue: Array<[string, number]> = [[rootId, 1]]
  const visited = new Set<string>()
  while (queue.length) {
    const [id, depth] = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    height = Math.max(height, depth)
    for (const folder of state.folders.values()) {
      if (folder.parentId === id) queue.push([folder.id, depth + 1])
    }
  }
  return height
}

export function promoteDemoFolderChildren(state: DemoState, root: Folder): void {
  const siblings = demoFolderSiblings(state, root.parentId)
  const children = demoFolderSiblings(state, root.id)
  const index = siblings.findIndex((folder) => folder.id === root.id)
  if (index < 0) return
  siblings.splice(index, 1, ...children)
  const now = Date.now()
  siblings.forEach((folder, orderIndex) => {
    state.folders.set(folder.id, {
      ...folder,
      parentId: folder.parentId === root.id ? root.parentId : folder.parentId,
      position: (orderIndex + 1) * 1000,
      updatedAt: folder.parentId === root.id ? now : folder.updatedAt,
    })
  })
}

export function folderDescendants(state: DemoState, rootId: string): Set<string> {
  const ids = new Set([rootId])
  let hasChanged = true
  while (hasChanged) {
    hasChanged = false
    for (const folder of state.folders.values()) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        hasChanged = true
      }
    }
  }
  return ids
}

