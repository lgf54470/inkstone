import { useMemo, useRef, useState } from 'react'
import type { NoteSummary } from '@shared/types'
import { useBreakpoint } from '../../../lib/hooks'
import { splitByRanges } from '../../../lib/fuzzy'
import { useContextMenu } from '../../../components/overlay'
import { useUi } from '../../../store/ui'
import { useNotes } from '../../../store/notes'
import { useBlogStore } from '../../blog'
import { useShareStore } from '../../share'
import { t, useLocale } from '../../../lib/i18n'

export interface NoteRowProps {
  note: NoteSummary
  highlight: [number, number][]
  density: 'comfortable' | 'compact'
  tagColors: Map<string, string | null | undefined>
  position: number
  total: number
  onRangeSelect: (noteId: string) => void
  isShared?: boolean
}

function useNoteRowShareState(noteId: string, isShared?: boolean) {
  const shares = useShareStore((s) => s.shares)
  const noteShare = useMemo(() => shares.find((s) => s.noteId === noteId) ?? null, [shares, noteId])
  const computedIsShared = isShared ?? Boolean(noteShare)
  return { noteShare, computedIsShared }
}

function useNoteRowBlogState(noteId: string) {
  const blogPosts = useBlogStore((s) => s.posts)
  const noteBlogPost = useMemo(() => blogPosts.find((p) => p.noteId === noteId) ?? null, [blogPosts, noteId])
  return { noteBlogPost, isBlogPublished: Boolean(noteBlogPost && noteBlogPost.isPublished) }
}

export function useNoteRowState({ note, highlight, density, tagColors, position, total, onRangeSelect, isShared }: NoteRowProps) {
  const breakpoint = useBreakpoint()
  const locale = useLocale()
  const toast = useUi((s) => s.toast)
  const active = useUi((s) => s.activeNoteId === note.id)
  const openInSecondary = useUi((s) => s.workspaceSecondaryNoteId === note.id)
  const selectedIds = useUi((s) => s.selectedIds)
  const selected = selectedIds.includes(note.id)
  const selectionHighlighted = selected && (selectedIds.length > 1 || !active)
  const toggleSelected = useUi((s) => s.toggleSelected)
  const openNote = useNotes((s) => s.openNote)
  const deleteNote = useNotes((s) => s.deleteNote)
  const setArchived = useNotes((s) => s.setArchived)
  const setStarred = useNotes((s) => s.setStarred)
  const setPinned = useNotes((s) => s.setPinned)
  const moveNotes = useNotes((s) => s.moveNotes)
  const restoreNote = useNotes((s) => s.restoreNote)
  const purgeNote = useNotes((s) => s.purgeNote)
  const duplicateNote = useNotes((s) => s.duplicateNote)
  const folders = useNotes((s) => s.folders)
  const view = useUi((s) => s.view)
  const activeFolderId = useUi((s) => s.folderId)
  const noteFolder = note.folderId ? folders.find((f) => f.id === note.folderId) ?? null : null
  const showFolderPill = Boolean(noteFolder && !(view === 'folder' && activeFolderId === note.folderId))
  const menu = useContextMenu()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [qrModalData, setQrModalData] = useState<{ url: string; title: string; slug: string } | null>(null)
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false)
  const { noteShare, computedIsShared } = useNoteRowShareState(note.id, isShared)
  const [isBlogPublishOpen, setIsBlogPublishOpen] = useState(false)
  const { noteBlogPost, isBlogPublished } = useNoteRowBlogState(note.id)
  const inTrash = Boolean(note.deletedAt)
  const titleParts = splitByRanges(note.title || t('common.untitled_note'), highlight)
  return {
    note, highlight, density, tagColors, position, total, onRangeSelect, isShared,
    breakpoint, locale, toast, active, openInSecondary, selected, selectionHighlighted, selectedIds,
    toggleSelected, openNote, deleteNote, setArchived, setStarred, setPinned, moveNotes, restoreNote,
    purgeNote, duplicateNote, folders, view, activeFolderId, noteFolder, showFolderPill,
    menu, menuButtonRef, isMenuOpen, setIsMenuOpen, isCreateFolderOpen, setIsCreateFolderOpen,
    isShareModalOpen, setIsShareModalOpen, qrModalData, setQrModalData, isAnalyticsOpen, setIsAnalyticsOpen,
    noteShare, computedIsShared, isBlogPublishOpen, setIsBlogPublishOpen, noteBlogPost, isBlogPublished,
    inTrash, titleParts,
  }
}

export type NoteRowState = ReturnType<typeof useNoteRowState>