import type { Tag } from '@shared/types';
import { compareTagNames } from '@shared/markdown-utils';

export interface TagTreeNode {
  fullPath: string;
  name: string;
  depth: number;
  tag: Tag;
  count: number;
  totalCount: number;
  isPinned: boolean;
  children: TagTreeNode[];
}

export function buildTagTree(tags: readonly Tag[]): TagTreeNode[] {
  const rootNodes: TagTreeNode[] = [];
  const nodeMap = new Map<string, TagTreeNode>();

  for (const tag of tags) {
    const segments = tag.name.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    let currentPath = '';
    let parentChildren = rootNodes;

    for (let depth = 0; depth < segments.length; depth++) {
      const segment = segments[depth]!;
      currentPath = depth === 0 ? segment : `${currentPath}/${segment}`;
      const isLeaf = depth === segments.length - 1;

      let existing = nodeMap.get(currentPath);
      if (!existing) {
        const syntheticTag: Tag = {
          id: `virtual:${currentPath}`,
          name: currentPath,
          color: null,
          count: 0,
          isPinned: false,
          createdAt: 0,
        };
        existing = {
          fullPath: currentPath,
          name: segment,
          depth,
          tag: isLeaf ? tag : syntheticTag,
          count: isLeaf ? tag.count : 0,
          totalCount: isLeaf ? tag.count : 0,
          isPinned: isLeaf ? Boolean(tag.isPinned) : false,
          children: [],
        };
        nodeMap.set(currentPath, existing);
        parentChildren.push(existing);
      } else if (isLeaf) {
        existing.tag = tag;
        existing.count = tag.count;
        existing.totalCount = Math.max(existing.totalCount, tag.count);
        if (tag.isPinned) existing.isPinned = true;
      }

      parentChildren = existing.children;
    }
  }

  function rollUp(node: TagTreeNode): void {
    let descendantCount = 0;
    for (const child of node.children) {
      rollUp(child);
      descendantCount += child.totalCount;
      if (child.isPinned) node.isPinned = true;
    }
    node.totalCount = node.count + descendantCount;
    node.children.sort((a, b) => {
      const aPin = a.isPinned;
      const bPin = b.isPinned;
      if (aPin !== bPin) return aPin ? -1 : 1;
      return b.totalCount - a.totalCount || compareTagNames(a.name, b.name);
    });
  }

  for (const root of rootNodes) {
    rollUp(root);
  }

  rootNodes.sort((a, b) => {
    const aPin = a.isPinned;
    const bPin = b.isPinned;
    if (aPin !== bPin) return aPin ? -1 : 1;
    return b.totalCount - a.totalCount || compareTagNames(a.name, b.name);
  });

  return rootNodes;
}

export function flattenTagTree(
  nodes: readonly TagTreeNode[],
  expandedPaths: ReadonlySet<string>
): TagTreeNode[] {
  const result: TagTreeNode[] = [];
  function traverse(list: readonly TagTreeNode[]) {
    for (const node of list) {
      result.push(node);
      if (node.children.length > 0 && expandedPaths.has(node.fullPath)) {
        traverse(node.children);
      }
    }
  }
  traverse(nodes);
  return result;
}
