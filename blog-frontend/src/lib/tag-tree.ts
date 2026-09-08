import type { BlogTag } from './types'

export interface TagTreeNode {
  /** 完整路径名（如 Inkstone/入门），父节点即子树前缀，与服务端 tag 过滤语义一致 */
  name: string
  /** 展示名（路径最后一段） */
  label: string
  /** 文章数：叶子为真实计数，父节点为子树聚合（含自身为真实标签时的计数） */
  count: number
  children: TagTreeNode[]
}

// 按 '/' 分段构建前缀树：Inkstone/入门 → Inkstone 父节点下挂入门叶子。
// 父节点自身也可以是真实标签（同时存在 A 与 A/B 时），计数叠加。
export function buildTagTree(tags: BlogTag[]): TagTreeNode[] {
  const root = new Map<string, TagTreeNode>()
  const nodeByPath = new Map<string, TagTreeNode>()

  const ensureNode = (path: string): TagTreeNode => {
    const existing = nodeByPath.get(path)
    if (existing) return existing
    const slash = path.lastIndexOf('/')
    const node: TagTreeNode = {
      name: path,
      label: slash === -1 ? path : path.slice(slash + 1),
      count: 0,
      children: [],
    }
    nodeByPath.set(path, node)
    if (slash === -1) {
      root.set(path, node)
    } else {
      ensureNode(path.slice(0, slash)).children.push(node)
    }
    return node
  }

  for (const tag of tags) {
    ensureNode(tag.name).count = tag.postsCount
  }
  aggregateCounts(root)
  return sortNodes([...root.values()])
}

function aggregateCounts(nodes: Map<string, TagTreeNode> | TagTreeNode[]): void {
  const list = nodes instanceof Map ? [...nodes.values()] : nodes
  for (const node of list) {
    if (node.children.length > 0) {
      aggregateCounts(node.children)
      node.count += node.children.reduce((sum, child) => sum + child.count, 0)
    }
  }
}

function sortNodes(nodes: TagTreeNode[]): TagTreeNode[] {
  return nodes
    .map((node) => ({ ...node, children: sortNodes(node.children) }))
    // 'en' locale 固定排序规则：避免 Cloudflare Worker V8 默认 locale 与
    // 用户浏览器 locale（如 zh-CN）的 localeCompare 结果不同，导致 SSR 和客户
    // 端渲染出不同的节点顺序，进而触发 React hydration error #418。
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en'))
}

// 模糊搜索：大小写不敏感子串匹配 label 或完整路径；命中的节点保留整条
// 路径（父链不匹配但子节点匹配时，父节点仍保留以保持层级可读）
export function filterTagTree(nodes: TagTreeNode[], query: string): TagTreeNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const matches = (node: TagTreeNode): boolean =>
    node.label.toLowerCase().includes(q) || node.name.toLowerCase().includes(q)

  const walk = (node: TagTreeNode): TagTreeNode | null => {
    const keptChildren = node.children
      .map(walk)
      .filter((child): child is TagTreeNode => child !== null)
    if (matches(node) || keptChildren.length > 0) {
      return { ...node, children: keptChildren }
    }
    return null
  }

  return nodes
    .map(walk)
    .filter((node): node is TagTreeNode => node !== null)
}

/** 返回给定标签完整路径上所有祖先节点名（不含自身），用于选中标签时自动展开其父链 */
export function ancestorNames(tagName: string): string[] {
  const names: string[] = []
  let slash = tagName.lastIndexOf('/')
  while (slash > 0) {
    names.unshift(tagName.slice(0, slash))
    slash = tagName.slice(0, slash).lastIndexOf('/')
  }
  return names
}