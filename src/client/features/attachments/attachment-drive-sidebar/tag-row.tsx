import { useRef, useState } from 'react';
import { ChevronRight, Hash, MoreHorizontal, Palette, Pin, Trash2 } from 'lucide-react';
import type { Tag } from '@shared/types';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/i18n';
import type { TagTreeNode } from '../../../lib/tag-tree';
import { Menu, useContextMenu, type MenuItem } from '../../../components/overlay';
import { TagColorSubmenu } from '../../tags';



export function DriveTagRow({
  node,
  selectedTag,
  expandedTagPaths,
  onToggleExpand,
  onSelectTag,
  patchTag,
  deleteTag,
}: {
  node: TagTreeNode
  selectedTag: string | null
  expandedTagPaths: Set<string>
  onToggleExpand: () => void
  onSelectTag: (tag: string | null) => void
  patchTag: (id: string, patch: Partial<Tag>) => Promise<void>
  deleteTag: (id: string) => Promise<void>
}) {
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const contextMenu = useContextMenu()

  const expanded = expandedTagPaths.has(node.fullPath)
  const hasChildren = node.children.length > 0
  const active = selectedTag === node.fullPath

  const castTag: Tag = {
    id: node.tag?.id ?? node.fullPath,
    name: node.tag?.name ?? node.name,
    color: node.tag?.color ?? null,
    isPinned: Boolean(node.tag?.isPinned),
    count: 0,
    createdAt: node.tag?.createdAt ?? Date.now(),
  }

  const menuItems: MenuItem[] = [
    {
      id: 'pin',
      label: node.tag?.isPinned ? t('tags.unpin') : t('tags.pin'),
      icon: <Pin size={13} />,
      onSelect: () => {
        if (node.tag) void patchTag(node.tag.id, { isPinned: !node.tag.isPinned })
      },
    },
    {
      id: 'color',
      label: t('tags.color'),
      icon: <Palette size={13} />,
      submenu: node.tag
        ? ({ closeMenu }) => (
            <TagColorSubmenu
              tag={castTag}
              onSelectColor={(color) => {
                if (node.tag) void patchTag(node.tag.id, { color })
                closeMenu()
              }}
              onManageTags={closeMenu}
            />
          )
        : null,
    },
    {
      id: 'delete',
      label: t('tags.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => {
        if (node.tag) void deleteTag(node.tag.id)
      },
    },
  ]

  return (
    <div>
      <div
        onContextMenu={(e) => {
          setIsMenuOpen(false)
          contextMenu.onContextMenu(e)
        }}
        style={{ paddingLeft: `${node.depth * 12 + 6}px` }}
        className={cn(
          'group flex h-7.5 w-full items-center gap-1 rounded-[var(--r-md)] pr-1 text-left text-[length:var(--text-12)] font-medium transition-colors',
          active
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-tertiary)] transition-transform',
            !hasChildren && 'invisible',
            expanded && 'rotate-90',
          )}
        >
          <ChevronRight size={11} />
        </button>

        <button
          type="button"
          onClick={() => onSelectTag(node.fullPath)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        >
          <Hash
            size={12}
            style={{ color: node.tag?.color ?? undefined }}
            className={cn('shrink-0', !node.tag?.color && 'text-[var(--text-quaternary)]')}
          />
          <span className="truncate">{node.name}</span>
        </button>

        <button
          ref={moreButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsMenuOpen((prev) => !prev)
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-opacity"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>

      <Menu
        open={isMenuOpen}
        anchor={moreButtonRef}
        items={menuItems}
        onClose={() => setIsMenuOpen(false)}
      />
      {contextMenu.point && (
        <Menu
          open
          anchor={contextMenu.point}
          items={menuItems}
          onClose={contextMenu.close}
        />
      )}
    </div>
  )
}
