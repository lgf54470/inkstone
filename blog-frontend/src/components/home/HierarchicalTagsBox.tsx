import { useMemo, useState, type ReactElement } from 'react'
import { ChevronDown, ChevronRight, Tags } from 'lucide-react'
import SearchInput from '../SearchInput'
import { buildTagTree, filterTagTree, ancestorNames, type TagTreeNode } from '../../lib/tag-tree'
import { t, DEFAULT_LOCALE, type BlogLocale } from '../../lib/i18n'
import type { BlogTag } from '../../lib/types'

interface HierarchicalTagsBoxProps {
  tags: BlogTag[]
  selectedTag: string | null
  locale?: BlogLocale
  onTagSelect: (tag: string) => void
}

// 选中标签时自动展开其祖先链，保证选中项可见；未手动操作过的父节点默认展开首层
function useExpanded(tree: TagTreeNode[], selectedTag: string | null) {
  const [manual, setManual] = useState<Map<string, boolean>>(() => new Map())

  const effective = useMemo(() => {
    const expanded = new Set<string>()
    if (selectedTag) {
      for (const name of ancestorNames(selectedTag)) expanded.add(name)
    }
    for (const node of tree) {
      if (node.children.length === 0) continue
      if ((manual.get(node.name) ?? true) === true) expanded.add(node.name)
    }
    return expanded
  }, [manual, tree, selectedTag])

  return {
    isExpanded: (name: string) => effective.has(name),
    toggle: (name: string) => {
      setManual((prev) => {
        const next = new Map(prev)
        next.set(name, !(next.get(name) ?? true))
        return next
      })
    },
  }
}

export default function HierarchicalTagsBox({
  tags,
  selectedTag,
  locale = DEFAULT_LOCALE,
  onTagSelect,
}: HierarchicalTagsBoxProps): ReactElement | null {
  const [query, setQuery] = useState('')
  const tree = useMemo(() => buildTagTree(tags), [tags])
  const visible = useMemo(() => filterTagTree(tree, query), [tree, query])
  const expanded = useExpanded(tree, selectedTag)
  const searching = query.trim() !== ''

  if (tree.length === 0) return null

  return (
    <div className='p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-xs)]'>
      <div className='flex items-center justify-between mb-2.5'>
        <h3 className='text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5'>
          <Tags className='w-3.5 h-3.5 text-[var(--accent)]' aria-hidden='true' />
          <span>{t('tagtree.title', {}, locale)}</span>
        </h3>
        <a href='/tags' className='text-xs text-[var(--accent)] hover:underline'>
          {t('home.all_tags', {}, locale)}
        </a>
      </div>

      <TagSearchInput query={query} locale={locale} onChange={setQuery} />

      {searching && visible.length === 0 ? (
        <p className='py-3 text-center text-xs text-[var(--text-tertiary)]'>{t('tagtree.no_match', {}, locale)}</p>
      ) : (
        <TagNodeList
          nodes={visible}
          searching={searching}
          selectedTag={selectedTag}
          locale={locale}
          isExpanded={expanded.isExpanded}
          onToggle={expanded.toggle}
          onTagSelect={onTagSelect}
        />
      )}
    </div>
  )
}

function TagSearchInput({
  query,
  locale,
  onChange,
}: {
  query: string
  locale: BlogLocale
  onChange: (value: string) => void
}): ReactElement {
  return (
    <div className='mb-2'>
      <SearchInput
        value={query}
        onChange={onChange}
        placeholder={t('tagtree.search_placeholder', {}, locale)}
        ariaLabel={t('tagtree.search_aria', {}, locale)}
        clearLabel={t('tagtree.clear_search', {}, locale)}
      />
    </div>
  )
}

function TagNodeList({
  nodes,
  searching,
  selectedTag,
  locale,
  isExpanded,
  onToggle,
  onTagSelect,
}: {
  nodes: TagTreeNode[]
  searching: boolean
  selectedTag: string | null
  locale: BlogLocale
  isExpanded: (name: string) => boolean
  onToggle: (name: string) => void
  onTagSelect: (tag: string) => void
}): ReactElement | null {
  if (nodes.length === 0) return null
  return (
    <ul className='space-y-0.5'>
      {nodes.map((node) => (
        <TagNodeItem
          key={node.name}
          node={node}
          searching={searching}
          selectedTag={selectedTag}
          locale={locale}
          isExpanded={isExpanded}
          onToggle={onToggle}
          onTagSelect={onTagSelect}
        />
      ))}
    </ul>
  )
}

function TagNodeItem({
  node,
  searching,
  selectedTag,
  locale,
  isExpanded,
  onToggle,
  onTagSelect,
}: {
  node: TagTreeNode
  searching: boolean
  selectedTag: string | null
  locale: BlogLocale
  isExpanded: (name: string) => boolean
  onToggle: (name: string) => void
  onTagSelect: (tag: string) => void
}): ReactElement {
  const isParent = node.children.length > 0
  const open = searching || isExpanded(node.name)
  return (
    <li>
      <TagRow
        node={node}
        isParent={isParent}
        open={open}
        isSelected={selectedTag === node.name}
        locale={locale}
        onToggle={onToggle}
        onTagSelect={onTagSelect}
      />
      {isParent && open && (
        <div className='ml-4 border-l border-[var(--border-subtle)] pl-1'>
          <TagNodeList
            nodes={node.children}
            searching={searching}
            selectedTag={selectedTag}
            locale={locale}
            isExpanded={isExpanded}
            onToggle={onToggle}
            onTagSelect={onTagSelect}
          />
        </div>
      )}
    </li>
  )
}

function TagRow({
  node,
  isParent,
  open,
  isSelected,
  locale,
  onToggle,
  onTagSelect,
}: {
  node: TagTreeNode
  isParent: boolean
  open: boolean
  isSelected: boolean
  locale: BlogLocale
  onToggle: (name: string) => void
  onTagSelect: (tag: string) => void
}): ReactElement {
  const rowClass =
    `w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ` +
    (isSelected
      ? 'bg-[var(--accent)] text-white font-semibold shadow-xs'
      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]')
  return (
    <div className='flex items-center gap-1'>
      {isParent ? (
        <button
          type='button'
          onClick={() => onToggle(node.name)}
          aria-label={open ? t('tagtree.collapse', {}, locale) : t('tagtree.expand', {}, locale)}
          className='p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer shrink-0'
        >
          {open ? <ChevronDown className='w-3.5 h-3.5' aria-hidden='true' /> : <ChevronRight className='w-3.5 h-3.5' aria-hidden='true' />}
        </button>
      ) : (
        <span className='w-4 shrink-0' />
      )}
      <button
        type='button'
        onClick={() => onTagSelect(node.name)}
        aria-pressed={isSelected}
        className={rowClass}
      >
        <span className='truncate'>{isParent ? node.label : `#${node.label}`}</span>
        <span className={`ml-auto text-[length:var(--text-10)] shrink-0 ${isSelected ? 'text-white/80' : 'text-[var(--text-quaternary)]'}`}>
          {node.count}
        </span>
      </button>
    </div>
  )
}