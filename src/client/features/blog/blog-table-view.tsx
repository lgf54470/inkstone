import { useRef, useState } from 'react'
import {
  BarChart2,
  Check,
  Copy,
  ExternalLink,
  FolderClosed,
  FolderInput,
  PauseCircle,
  Pin,
  PlayCircle,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react'
import type { BlogPost, BlogCategory, BlogFolder } from '@shared/types'
import { IconButton } from '../../components/primitives'
import { Menu, confirm, useContextMenu, type MenuItem } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useBlogStore } from './blog-store'
import { PostCoverImage } from './blog-grid-view'

export function BlogTableView({
  posts,
  onOpenEdit,
}: {
  posts: BlogPost[]
  onOpenEdit: (post: BlogPost) => void
}) {
  const categories = useBlogStore((s) => s.categories)
  const folders = useBlogStore((s) => s.folders)
  const selectedPostIds = useBlogStore((s) => s.selectedPostIds)
  const toggleSelectPost = useBlogStore((s) => s.toggleSelectPost)
  const selectAllPosts = useBlogStore((s) => s.selectAllPosts)
  const clearPostSelection = useBlogStore((s) => s.clearPostSelection)
  const settings = useBlogStore((s) => s.settings)

  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')

  const isAllSelected =
    posts.length > 0 && posts.every((p) => selectedPostIds.has(p.id))

  const handleToggleAll = () => {
    if (isAllSelected) {
      clearPostSelection()
    } else {
      selectAllPosts(posts.map((p) => p.id))
    }
  }

  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const folderMap = new Map(folders.map((f) => [f.id, f]))

  return (
    <div className="w-full overflow-x-auto text-[length:var(--text-12\.5)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]">
            <th className="w-10 px-3 py-2.5 text-center">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleAll}
                className="size-3.5 rounded accent-[var(--accent)] cursor-pointer"
              />
            </th>
            <th className="px-3 py-2.5 min-w-[200px]">{t('blog.col_title')}</th>
            <th className="px-3 py-2.5 w-[110px]">{t('blog.folders')}</th>
            <th className="px-3 py-2.5 w-[100px]">{t('blog.category')}</th>
            <th className="px-3 py-2.5 w-[130px]">{t('blog.tags')}</th>
            <th className="px-3 py-2.5 w-[85px] min-w-[76px] whitespace-nowrap">{t('blog.col_status')}</th>
            <th className="px-3 py-2.5 w-[65px] text-right">{t('share.metric_pv')}</th>
            <th className="px-3 py-2.5 w-[65px] text-right">{t('blog.col_comments')}</th>
            <th className="px-3 py-2.5 w-[105px] whitespace-nowrap">{t('blog.col_created_at')}</th>
            <th className="px-3 py-2.5 w-[170px] text-right whitespace-nowrap">{t('blog.col_actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {posts.map((post) => {
            const isSelected = selectedPostIds.has(post.id)
            const cat = post.categoryId ? categoryMap.get(post.categoryId) ?? null : null
            const folder = post.folderId ? folderMap.get(post.folderId) ?? null : null

            return (
              <BlogTableRow
                key={post.id}
                post={post}
                isSelected={isSelected}
                cat={cat}
                folder={folder}
                folders={folders}
                frontendBase={frontendBase}
                onToggleSelect={() => toggleSelectPost(post.id)}
                onOpenEdit={onOpenEdit}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BlogTableRow({
  post,
  isSelected,
  cat,
  folder,
  folders,
  frontendBase,
  onToggleSelect,
  onOpenEdit,
}: {
  post: BlogPost
  isSelected: boolean
  cat: BlogCategory | null
  folder: BlogFolder | null
  folders: BlogFolder[]
  frontendBase: string
  onToggleSelect: () => void
  onOpenEdit: (post: BlogPost) => void
}) {
  const toast = useUi((s) => s.toast)
  const updatePost = useBlogStore((s) => s.updatePost)
  const deletePost = useBlogStore((s) => s.deletePost)
  const syncPost = useBlogStore((s) => s.syncPost)
  const batchMoveToFolder = useBlogStore((s) => s.batchMoveToFolder)
  const setActiveTab = useBlogStore((s) => s.setActiveTab)

  const contextMenu = useContextMenu()
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false)
  const folderButtonRef = useRef<HTMLButtonElement>(null)

  const postUrl = `${frontendBase}/posts/${post.slug}`

  const handleCopyLink = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`${frontendBase}/posts/${slug}`)
      toast({ title: t('blog.link_copied'), tone: 'success' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  const handleSync = async () => {
    try {
      await syncPost(post.id)
      toast({ title: t('blog.sync_success'), tone: 'success' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('common.delete'),
      description: t('blog.confirm_delete_post_detail', { value0: post.title }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    await deletePost(post.id)
    toast({ title: t('blog.post_deleted'), tone: 'default' })
  }

  const handleMoveToFolder = async (folderId: string | null) => {
    const ok = await batchMoveToFolder([post.id], folderId)
    if (ok) {
      toast({
        title: t('blog.batch_move_folder_success', { count: 1 }),
        tone: 'success',
      })
    }
  }

  const folderMenuItems: MenuItem[] = [
    {
      id: 'none',
      label: t('blog.no_folder'),
      icon: <FolderClosed size={13} className="text-[var(--text-quaternary)]" />,
      checked: !post.folderId,
      onSelect: () => void handleMoveToFolder(null),
    },
    ...folders.map((f) => ({
      id: f.id,
      label: f.name,
      icon: (
        <span style={{ color: f.color ?? undefined }} className="shrink-0">
          <FolderClosed size={13} />
        </span>
      ),
      checked: post.folderId === f.id,
      onSelect: () => void handleMoveToFolder(f.id),
    })),
  ]

  const contextMenuItems: MenuItem[] = [
    {
      id: 'open_link',
      label: t('preview.open_in_new_tab'),
      icon: <ExternalLink size={13} />,
      onSelect: () => window.open(postUrl, '_blank'),
    },
    {
      id: 'copy_link',
      label: t('blog.copy_link'),
      icon: <Copy size={13} />,
      onSelect: () => void handleCopyLink(post.slug),
    },
    {
      id: 'analytics',
      label: t('share.view_note_analytics'),
      icon: <BarChart2 size={13} />,
      onSelect: () => setActiveTab('dashboard'),
    },
    {
      id: 'settings',
      label: t('blog.post_settings'),
      icon: <Settings2 size={13} />,
      onSelect: () => onOpenEdit(post),
    },
    {
      id: 'move',
      label: t('blog.batch_move_folder'),
      icon: <FolderInput size={13} />,
      separatorBefore: true,
      submenu: ({ closeMenu }) => (
        <div className="py-1 min-w-[160px]">
          <button
            type="button"
            onClick={() => {
              closeMenu()
              void handleMoveToFolder(null)
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
              !post.folderId && 'text-[var(--accent)] font-semibold',
            )}
          >
            <FolderClosed size={13} className="text-[var(--text-quaternary)]" />
            <span className="flex-1 truncate">{t('blog.no_folder')}</span>
            {!post.folderId && <Check size={12} className="text-[var(--accent)]" />}
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                closeMenu()
                void handleMoveToFolder(f.id)
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
                post.folderId === f.id && 'text-[var(--accent)] font-semibold',
              )}
            >
              <FolderClosed size={13} style={{ color: f.color ?? undefined }} className="shrink-0" />
              <span className="flex-1 truncate">{f.name}</span>
              {post.folderId === f.id && <Check size={12} className="text-[var(--accent)]" />}
            </button>
          ))}
        </div>
      ),
    },
    {
      id: 'toggle',
      label: post.isPublished ? t('blog.unpublish') : t('blog.publish'),
      icon: post.isPublished ? (
        <PauseCircle size={13} className="text-[var(--warning)]" />
      ) : (
        <PlayCircle size={13} className="text-[var(--success)]" />
      ),
      onSelect: () => void updatePost(post.id, { isPublished: !post.isPublished }),
    },
    {
      id: 'pin',
      label: post.isPinned ? t('blog.unpin_post') : t('blog.pin_post'),
      icon: <Pin size={13} className={post.isPinned ? 'text-[var(--accent)] fill-current' : ''} />,
      onSelect: () => void updatePost(post.id, { isPinned: !post.isPinned }),
    },
    {
      id: 'delete',
      label: t('common.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => void handleDelete(),
    },
  ]

  return (
    <tr
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/inkstone-blog-post-ids', JSON.stringify([post.id]))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onContextMenu={(e) => {
        setIsFolderMenuOpen(false)
        contextMenu.onContextMenu(e)
      }}
      onDoubleClick={() => onOpenEdit(post)}
      className={cn(
        'group transition-colors hover:bg-[var(--bg-hover)] cursor-grab active:cursor-grabbing select-none',
        isSelected && 'bg-[var(--accent-softer)]',
      )}
      title={t('blog.drag_to_folder_hint')}
    >
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="size-3.5 rounded accent-[var(--accent)] cursor-pointer"
        />
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-9 shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
            <PostCoverImage
              src={post.coverUrl}
              alt={post.title}
              fallbackIconSize={14}
              className="size-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {post.isPinned && (
                <Pin size={11} className="text-[var(--accent)] shrink-0 fill-current" />
              )}
              <span className="truncate font-medium text-[var(--text-primary)]">
                {post.title}
              </span>
            </div>
            <div className="text-[length:var(--text-11)] text-[var(--text-quaternary)] truncate">
              /{post.slug}
            </div>
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5">
        {folder ? (
          <span
            className="inline-flex items-center gap-1 truncate max-w-[100px] rounded-[var(--r-sm)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium"
            style={{
              backgroundColor: folder.color ? `${folder.color}15` : 'var(--bg-sunken)',
              color: folder.color || 'var(--text-secondary)',
            }}
          >
            <FolderClosed size={10} className="shrink-0" />
            <span className="truncate">{folder.name}</span>
          </span>
        ) : (
          <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">-</span>
        )}
      </td>

      <td className="px-3 py-2.5">
        {cat ? (
          <span
            className="inline-block truncate max-w-[95px] rounded-[var(--r-sm)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium"
            style={{
              backgroundColor: cat.color ? `${cat.color}15` : 'var(--bg-sunken)',
              color: cat.color || 'var(--text-secondary)',
            }}
          >
            {cat.name}
          </span>
        ) : (
          <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">-</span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1 max-w-[130px]">
          {post.tags.slice(0, 2).map((tg) => (
            <span
              key={tg}
              className="rounded bg-[var(--bg-sunken)] px-1 py-0.2 text-[length:var(--text-10)] text-[var(--text-tertiary)] truncate max-w-[80px]"
              title={tg}
            >
              #{tg.includes('/') ? tg.split('/').pop() : tg}
            </span>
          ))}
          {post.tags.length > 2 && (
            <span className="text-[length:var(--text-10)] text-[var(--text-quaternary)]">
              +{post.tags.length - 2}
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-2.5 whitespace-nowrap min-w-[76px] shrink-0">
        {post.isPublished ? (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[length:var(--text-10\.5)] font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0">
            {t('blog.published')}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-stone-500/10 px-2 py-0.5 text-[length:var(--text-10\.5)] font-medium text-stone-500 whitespace-nowrap shrink-0">
            {t('blog.draft')}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5 text-right font-medium text-[var(--text-secondary)]">
        {post.views}
      </td>

      <td className="px-3 py-2.5 text-right font-medium text-[var(--text-secondary)]">
        {post.commentsCount ?? 0}
      </td>

      <td className="px-3 py-2.5 text-[length:var(--text-11\.5)] text-[var(--text-quaternary)] whitespace-nowrap">
        {new Date(post.publishedAt).toLocaleDateString()}
      </td>

      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <IconButton
            ref={folderButtonRef}
            size="sm"
            label={t('blog.batch_move_folder')}
            onClick={() => setIsFolderMenuOpen((prev) => !prev)}
          >
            <FolderInput size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={post.isPinned ? t('blog.unpin_post') : t('blog.pin_post')}
            onClick={() => void updatePost(post.id, { isPinned: !post.isPinned })}
            className={cn(
              post.isPinned
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-quaternary)] hover:text-[var(--accent)]',
            )}
          >
            <Pin size={13} className={post.isPinned ? 'fill-current' : ''} />
          </IconButton>

          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            title={t('blog.view_in_blog')}
          >
            <ExternalLink size={13} />
          </a>

          <IconButton
            size="sm"
            label={t('blog.copy_link')}
            onClick={() => void handleCopyLink(post.slug)}
          >
            <Copy size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={t('blog.post_settings')}
            onClick={() => onOpenEdit(post)}
          >
            <Settings2 size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={t('blog.sync_post')}
            onClick={() => void handleSync()}
          >
            <RefreshCw size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={t('common.delete')}
            onClick={() => void handleDelete()}
            className="text-[var(--danger)] hover:opacity-80"
          >
            <Trash2 size={13} />
          </IconButton>
        </div>

        <Menu
          open={isFolderMenuOpen}
          anchor={folderButtonRef}
          items={folderMenuItems}
          onClose={() => setIsFolderMenuOpen(false)}
        />

        {contextMenu.point && (
          <Menu
            open
            anchor={contextMenu.point}
            items={contextMenuItems}
            onClose={contextMenu.close}
          />
        )}
      </td>
    </tr>
  )
}
