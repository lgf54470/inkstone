import { describe, expect, it } from 'vitest'
import { ancestorNames, buildTagTree, filterTagTree } from './tag-tree'

describe('buildTagTree', () => {
  it('groups slash-separated tags under parent nodes and aggregates counts', () => {
    const tree = buildTagTree([
      { name: 'Inkstone/入门', postsCount: 1 },
      { name: 'Inkstone/markdown', postsCount: 2 },
      { name: '生活', postsCount: 3 },
    ])
    expect(tree).toHaveLength(2)
    const inkstone = tree.find((n) => n.name === 'Inkstone')!
    expect(inkstone.label).toBe('Inkstone')
    expect(inkstone.count).toBe(3)
    expect(inkstone.children.map((c) => c.name)).toEqual(['Inkstone/markdown', 'Inkstone/入门'])
    expect(inkstone.children[0]!.count).toBe(2)
    const life = tree.find((n) => n.name === '生活')!
    expect(life.children).toHaveLength(0)
    expect(life.count).toBe(3)
  })

  it('supports deeper nesting and adds own count when parent is also a real tag', () => {
    const tree = buildTagTree([
      { name: '前端', postsCount: 1 },
      { name: '前端/React/状态管理', postsCount: 2 },
      { name: '前端/React/组件', postsCount: 3 },
    ])
    const fe = tree[0]!
    expect(fe.name).toBe('前端')
    expect(fe.count).toBe(6)
    const react = fe.children[0]!
    expect(react.name).toBe('前端/React')
    expect(react.label).toBe('React')
    expect(react.children).toHaveLength(2)
  })

  it('sorts siblings by count descending, then name', () => {
    const tree = buildTagTree([
      { name: 'B', postsCount: 1 },
      { name: 'A', postsCount: 5 },
      { name: 'C', postsCount: 2 },
    ])
    expect(tree.map((n) => n.name)).toEqual(['A', 'C', 'B'])
  })

  it('returns empty for no tags', () => {
    expect(buildTagTree([])).toEqual([])
  })
})

describe('filterTagTree', () => {
  const tree = buildTagTree([
    { name: 'Inkstone/入门', postsCount: 1 },
    { name: 'Inkstone/markdown', postsCount: 2 },
    { name: '生活', postsCount: 3 },
  ])

  it('returns the full tree for an empty query', () => {
    expect(filterTagTree(tree, '')).toHaveLength(2)
    expect(filterTagTree(tree, '   ')).toHaveLength(2)
  })

  it('keeps matching branches with their parents', () => {
    const filtered = filterTagTree(tree, 'markdown')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.name).toBe('Inkstone')
    expect(filtered[0]!.children.map((c) => c.name)).toEqual(['Inkstone/markdown'])
  })

  it('matches parent labels case-insensitively and keeps the parent subtree', () => {
    const filtered = filterTagTree(tree, 'inkstone')
    expect(filtered[0]!.children).toHaveLength(2)
  })

  it('returns empty when nothing matches', () => {
    expect(filterTagTree(tree, '不存在的')).toEqual([])
  })
})

describe('ancestorNames', () => {
  it('returns the parent chain without the tag itself', () => {
    expect(ancestorNames('前端/React/状态管理')).toEqual(['前端', '前端/React'])
    expect(ancestorNames('Inkstone/入门')).toEqual(['Inkstone'])
    expect(ancestorNames('生活')).toEqual([])
  })
})