import type { BlogFolder } from '@shared/types';
import type { BlogFolderNode } from './types';



export function buildBlogFolderTree(folders: BlogFolder[]): BlogFolderNode[] {
  const map = new Map<string, BlogFolderNode>()
  const roots: BlogFolderNode[] = []
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
