import { describe, expect, it } from 'vitest';
import type { Tag } from '@shared/types';
import { buildTagTree, flattenTagTree } from './tag-tree';

function tag(name: string, count = 0, isPinned = false): Tag {
  return { id: name, name, color: null, count, isPinned, createdAt: 0 };
}

describe('tag-tree', () => {
  it('builds flat tree for tags without slashes', () => {
    const tags = [tag('alpha', 2), tag('beta', 5)];
    const tree = buildTagTree(tags);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.name).toBe('beta');
    expect(tree[1]!.name).toBe('alpha');
    expect(tree[0]!.children).toHaveLength(0);
  });

  it('builds nested hierarchy for slashed tags', () => {
    const tags = [
      tag('work', 3),
      tag('work/frontend', 5),
      tag('work/backend', 2),
      tag('personal', 1),
    ];
    const tree = buildTagTree(tags);
    expect(tree).toHaveLength(2);
    const workNode = tree.find((n) => n.fullPath === 'work');
    expect(workNode).toBeDefined();
    expect(workNode!.count).toBe(3);
    expect(workNode!.totalCount).toBe(10);
    expect(workNode!.children).toHaveLength(2);
    expect(workNode!.children[0]!.name).toBe('frontend');
    expect(workNode!.children[1]!.name).toBe('backend');
  });

  it('creates synthetic parent node if parent tag does not exist directly', () => {
    const tags = [tag('project/alpha', 4)];
    const tree = buildTagTree(tags);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.fullPath).toBe('project');
    expect(tree[0]!.count).toBe(0);
    expect(tree[0]!.totalCount).toBe(4);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.fullPath).toBe('project/alpha');
  });

  it('rolls up pinned status to parent', () => {
    const tags = [
      tag('work', 1, false),
      tag('work/urgent', 1, true),
      tag('life', 5, false),
    ];
    const tree = buildTagTree(tags);
    expect(tree[0]!.fullPath).toBe('work');
    expect(tree[0]!.isPinned).toBe(true);
  });

  it('flattens tree according to expanded paths', () => {
    const tags = [
      tag('work', 3),
      tag('work/fe', 2),
      tag('life', 1),
    ];
    const tree = buildTagTree(tags);
    const collapsed = flattenTagTree(tree, new Set());
    expect(collapsed.map((n) => n.fullPath)).toEqual(['work', 'life']);

    const expanded = flattenTagTree(tree, new Set(['work']));
    expect(expanded.map((n) => n.fullPath)).toEqual(['work', 'work/fe', 'life']);
  });
});
