import type { ShareFolder } from '@shared/types';
import type { ShareFolderNode } from './types';



export function buildShareFolderTree(folders: ShareFolder[]): ShareFolderNode[] {
  const map = new Map<string, ShareFolderNode>()
  const roots: ShareFolderNode[] = []
  for (const f of folders) {
    map.set(f.id, { folder: f, children: [], depth: 0 })
  }
  for (const f of folders) {
    const node = map.get(f.id)!
    if (f.parentId && map.has(f.parentId)) {
      const parent = map.get(f.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}
