import type { Tag } from '@shared/types'
import type { TagTreeNode } from '../../lib/tag-tree'
import { t } from '../../lib/i18n'
import { TagRow, type TagRowActions } from './tag-row'

interface TagTreeListProps {
  nodes: readonly TagTreeNode[]
  expandedPaths: ReadonlySet<string>
  onTogglePath: (path: string) => void
  actions: (tag: Tag) => TagRowActions
  activeName: string | null
  selectedNames?: readonly string[]
  highlightedIndex?: number
  searchQuery?: string
  searchResults?: readonly Tag[]
  renamingId: string | null
  onSelect: (name: string, event: React.MouseEvent<HTMLButtonElement>) => void
  onStartRename: (id: string) => void
  onFinishRename: (tag: Tag, value: string) => void
  onCancelRename: () => void
}

export function TagTreeList({
  nodes,
  expandedPaths,
  onTogglePath,
  actions,
  activeName,
  selectedNames = [],
  highlightedIndex = 0,
  searchQuery = '',
  searchResults,
  renamingId,
  onSelect,
  onStartRename,
  onFinishRename,
  onCancelRename,
}: TagTreeListProps) {
  if (searchResults) {
    return (
      <>
        {searchResults.map((tag, index) => (
          <TagRow
            key={tag.id}
            tag={tag}
            active={activeName === tag.name}
            selected={selectedNames.includes(tag.name)}
            highlighted={index === highlightedIndex}
            searchQuery={searchQuery}
            renaming={renamingId === tag.id}
            actions={actions(tag)}
            onOpen={(event) => onSelect(tag.name, event)}
            onStartRename={() => onStartRename(tag.id)}
            onFinishRename={(value) => onFinishRename(tag, value)}
            onCancelRename={onCancelRename}
          />
        ))}
      </>
    )
  }
  return (
    <>
      {nodes.map((node) => (
        <TagRow
          key={node.fullPath}
          tag={node.tag}
          displayName={node.name}
          depth={node.depth}
          hasChildren={node.children.length > 0}
          isExpanded={expandedPaths.has(node.fullPath)}
          onToggleExpand={() => onTogglePath(node.fullPath)}
          count={node.children.length > 0 ? node.totalCount : node.count}
          active={activeName === node.fullPath}
          selected={selectedNames.includes(node.fullPath)}
          highlighted={false}
          searchQuery=''
          renaming={renamingId === node.tag.id}
          actions={actions(node.tag)}
          onOpen={(event) => onSelect(node.fullPath, event)}
          onStartRename={() => onStartRename(node.tag.id)}
          onFinishRename={(value) => onFinishRename(node.tag, value)}
          onCancelRename={onCancelRename}
        />
      ))}
    </>
  )
}

export function TagTreeListEmpty({ title }: { title?: string }) {
  return (
    <p className='px-2 py-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
      {title ?? t('tags.no_match')}
    </p>
  )
}
