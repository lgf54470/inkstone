import { useState } from 'react'
import {
  ExternalLink,
  Copy,
  BarChart2,
  Settings2,
  RefreshCw,
  Trash2,
  Check,
} from 'lucide-react'
import type { BlogPost } from '@shared/types'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useNotes } from '../../store/notes'
import { confirm } from '../../components/overlay'
import { upsertFrontMatterProperty } from '@shared/markdown-utils'
import { useBlogStore } from './blog-store'

export function BlogNoteSubmenu({
  noteId,
  post,
  closeMenu,
  onOpenSettings,
  onOpenStats,
}: {
  noteId: string
  post: BlogPost
  closeMenu: () => void
  onOpenSettings: () => void
  onOpenStats: () => void
}) {
  const toast = useUi((s) => s.toast)
  const settings = useBlogStore((s) => s.settings)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')
  const postUrl = `${frontendBase}/posts/${post.slug}`

  const handleOpenBlog = () => {
    window.open(postUrl, '_blank', 'noopener,noreferrer')
    closeMenu()
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl)
      setCopied(true)
      toast({ title: t('blog.link_copied'), tone: 'success' })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
    closeMenu()
  }

  const handleSync = async () => {
    setBusy(true)
    try {
      await api.blog.posts.sync(post.id)
      await useBlogStore.getState().loadPosts()
      toast({ title: t('blog.sync_success'), tone: 'success' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setBusy(false)
      closeMenu()
    }
  }

  const handleUnpublish = async () => {
    const ok = await confirm({
      title: t('blog.confirm_unpublish'),
      description: t('blog.unpublish_description'),
      confirmLabel: t('blog.unpublish'),
      tone: 'danger',
    })
    if (!ok) return

    setBusy(true)
    try {
      // 1. Update backend blog post status to unpublished
      await api.blog.posts.patch(post.id, { isPublished: false })
      await useBlogStore.getState().loadPosts()

      // 2. Update original note Frontmatter: isPublished = false
      const notesState = useNotes.getState()
      const activeNote = notesState.notes[noteId]
      if (activeNote) {
        let noteContent = notesState.contents[noteId]
        if (noteContent === undefined) {
          noteContent = (await notesState.peekContent(noteId)) ?? ''
        }
        const updatedContent = upsertFrontMatterProperty(noteContent, 'isPublished', false)
        notesState.editContent(noteId, updatedContent)
        await notesState.flush({ immediate: true })
      }

      toast({ title: t('blog.unpublish'), tone: 'default' })
      closeMenu()
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="w-[220px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none space-y-0.5 text-[12.5px]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. View in Blog */}
      <button
        type="button"
        onClick={handleOpenBlog}
        disabled={busy}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <ExternalLink size={13} className="shrink-0 text-[var(--accent)]" />
        <span className="min-w-0 flex-1 truncate">{t('blog.view_in_blog')}</span>
      </button>

      {/* 2. Copy Blog Link */}
      <button
        type="button"
        onClick={() => void handleCopyLink()}
        disabled={busy}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        {copied ? (
          <Check size={13} className="shrink-0 text-[var(--success)]" />
        ) : (
          <Copy size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        )}
        <span className="min-w-0 flex-1 truncate">{t('blog.copy_link')}</span>
      </button>

      {/* 3. View Comments & Stats */}
      <button
        type="button"
        onClick={() => {
          closeMenu()
          onOpenStats()
        }}
        disabled={busy}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <BarChart2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate">{t('blog.comments_and_stats')}</span>
      </button>

      {/* 4. Post Settings */}
      <button
        type="button"
        onClick={() => {
          closeMenu()
          onOpenSettings()
        }}
        disabled={busy}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Settings2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate">{t('blog.post_settings')}</span>
      </button>

      {/* 5. Sync from Note */}
      <button
        type="button"
        onClick={() => void handleSync()}
        disabled={busy}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <RefreshCw size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate">{t('blog.sync_post')}</span>
      </button>

      {/* Separator */}
      <div role="separator" className="my-1 h-px bg-[var(--border-subtle)]" />

      {/* 6. Unpublish */}
      <button
        type="button"
        onClick={() => void handleUnpublish()}
        disabled={busy}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--danger)] transition-colors hover:bg-[var(--danger-subtle)]"
      >
        <Trash2 size={13} className="shrink-0 text-[var(--danger)]" />
        <span className="min-w-0 flex-1 truncate">{t('blog.unpublish')}</span>
      </button>
    </div>
  )
}
