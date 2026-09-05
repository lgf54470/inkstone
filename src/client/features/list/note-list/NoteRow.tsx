import { memo, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckSquare2,
  Columns2,
  Copy,
  FileCode,
  FileDown,
  FileText,
  FolderClosed,
  FolderInput,
  Globe,
  MoreHorizontal,
  Pin,
  PinOff,
  RotateCcw,
  Share2,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import type { NoteSummary } from '@shared/types';
import { cn } from '../../../lib/cn';
import { errorMessage } from '../../../lib/errors';
import { splitByRanges } from '../../../lib/fuzzy';
import { useBreakpoint } from '../../../lib/hooks';
import { exportNoteAsHtml, exportNoteAsMarkdown, exportNoteAsPdf } from '../../../lib/export-note';
import { IconButton } from '../../../components/primitives';
import { Menu, Tooltip, confirm, useContextMenu, type MenuItem } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { useNotes } from '../../../store/notes';
import { openFolderView } from '../../../lib/folders';
import { CreateFolderModal, MoveToFolderSubmenu } from '../../folders';
import { useBlogStore, BlogNoteSubmenu, BlogPublishModal } from '../../blog';
import { ShareEditModal, ShareNoteAnalyticsModal, ShareNoteSubmenu, ShareQrModal, useShareStore } from '../../share';
import { TagPill } from '../../../components/TagPill';
import { removeTagFromNote } from '../../tags';
import { t, useLocale } from '../../../lib/i18n';

export const NoteRow = memo(function NoteRow({ note, highlight, density, tagColors, position, total, onRangeSelect, isShared, }: {
    note: NoteSummary;
    highlight: [
        number,
        number
    ][];
    density: 'comfortable' | 'compact';
    tagColors: Map<string, string | null>;
    position: number;
    total: number;
    onRangeSelect: (noteId: string) => void;
    isShared?: boolean;
}) {
    const breakpoint = useBreakpoint();
    const locale = useLocale();
    const toast = useUi((s) => s.toast);
    const active = useUi((s) => s.activeNoteId === note.id);
    const openInSecondary = useUi((s) => s.workspaceSecondaryNoteId === note.id);
    const selectedIds = useUi((s) => s.selectedIds);
    const selected = selectedIds.includes(note.id);
    const selectionHighlighted = selected && (selectedIds.length > 1 || !active);
    const toggleSelected = useUi((s) => s.toggleSelected);
    const openNote = useNotes((s) => s.openNote);
    const deleteNote = useNotes((s) => s.deleteNote);
    const setArchived = useNotes((s) => s.setArchived);
    const setStarred = useNotes((s) => s.setStarred);
    const setPinned = useNotes((s) => s.setPinned);
    const moveNotes = useNotes((s) => s.moveNotes);
    const restoreNote = useNotes((s) => s.restoreNote);
    const purgeNote = useNotes((s) => s.purgeNote);
    const duplicateNote = useNotes((s) => s.duplicateNote);
    const folders = useNotes((s) => s.folders);
    const view = useUi((s) => s.view);
    const activeFolderId = useUi((s) => s.folderId);
    const noteFolder = note.folderId ? folders.find((f) => f.id === note.folderId) ?? null : null;
    const showFolderPill = Boolean(noteFolder && !(view === 'folder' && activeFolderId === note.folderId));
    const menu = useContextMenu();
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [createFolderOpen, setCreateFolderOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [qrModalData, setQrModalData] = useState<{ url: string; title: string; slug: string } | null>(null);
    const [analyticsOpen, setAnalyticsOpen] = useState(false);
    const shares = useShareStore((s) => s.shares);
    const noteShare = useMemo(() => shares.find((s) => s.noteId === note.id) ?? null, [shares, note.id]);
    const computedIsShared = isShared ?? Boolean(noteShare);
    const [blogPublishOpen, setBlogPublishOpen] = useState(false);
    const blogPosts = useBlogStore((s) => s.posts);
    const noteBlogPost = useMemo(() => blogPosts.find((p) => p.noteId === note.id) ?? null, [blogPosts, note.id]);
    const isBlogPublished = Boolean(noteBlogPost && noteBlogPost.isPublished);


    const handleSelectFolder = (folderId: string | null) => {
        const targetIds = selectedIds.includes(note.id) ? selectedIds : [note.id];
        void moveNotes(targetIds, folderId);
        if (folderId) {
            const folder = folders.find((f) => f.id === folderId);
            if (folder) {
                toast({
                    title: t("notes.move_to_value0", { value0: folder.name }),
                    tone: 'success',
                });
            }
        }
    };
    const handleManageFolders = () => {
        useUi.getState().openPanel('folders');
    };
    const purgeRef = useRef(false);
    const [purging, setPurging] = useState(false);
    const inTrash = Boolean(note.deletedAt);
    const purge = async () => {
        if (purgeRef.current)
            return;
        purgeRef.current = true;
        setPurging(true);
        try {
            const ok = await confirm({
                title: t("notes.permanently_delete_this_note"),
                description: t("notes.this_operation_cannot_be_undone"),
                confirmLabel: t("notes.delete_permanently"),
                tone: 'danger',
            });
            if (ok)
                await purgeNote(note.id);
        }
        finally {
            purgeRef.current = false;
            setPurging(false);
        }
    };
    const exportNote = async (format: 'md' | 'html' | 'pdf') => {
        const state = useNotes.getState();
        let content = state.contents[note.id];
        if (content === undefined) {
            await state.openNote(note.id);
            content = useNotes.getState().contents[note.id];
            if (content === undefined) {
                toast({ title: t("common.export_failed"), tone: 'danger' });
                return;
            }
        }
        const payload = { title: note.title, content };
        if (format === 'md') {
            exportNoteAsMarkdown(payload);
            return;
        }
        try {
            if (format === 'html')
                await exportNoteAsHtml(payload, locale);
            else
                await exportNoteAsPdf(payload, locale);
        }
        catch (err) {
            toast({
                title: t("common.export_failed"),
                description: errorMessage(err),
                tone: 'danger',
            });
        }
    };
    const items: MenuItem[] = inTrash
        ? [
            { id: 'restore', label: t("common.restore"), icon: <RotateCcw size={13}/>, onSelect: () => void restoreNote(note.id) },
            {
                id: 'purge',
                label: t("notes.delete_permanently"),
                icon: <Trash2 size={13}/>,
                tone: 'danger',
                separatorBefore: true,
                disabled: purging,
                onSelect: () => void purge(),
            },
        ]
        : [
            ...(breakpoint === 'desktop' ? [{
                id: 'open-side',
                label: t("notes.open_to_side"),
                icon: <Columns2 size={13}/>,
                onSelect: () => void openNote(note.id, { pane: 'secondary' }),
            } satisfies MenuItem] : []),
            ...(breakpoint === 'mobile' ? [{
                id: 'multi-select',
                label: t("notes.add_to_selection"),
                icon: <CheckSquare2 size={13}/>,
                disabled: selectedIds.includes(note.id),
                onSelect: () => toggleSelected(note.id, true),
            } satisfies MenuItem] : []),
            {
                id: 'pin',
                label: note.isPinned ? t("notes.unpin") : t("notes.pin"),
                icon: note.isPinned ? <PinOff size={13}/> : <Pin size={13}/>,
                onSelect: () => void setPinned(note.id, !note.isPinned),
            },
            {
                id: 'star',
                label: note.isStarred ? t("common.remove_from_favorites") : t("navigation.favorites"),
                icon: note.isStarred ? <StarOff size={13}/> : <Star size={13}/>,
                combo: 'mod+d',
                onSelect: () => void setStarred(note.id, !note.isStarred),
            },
            { id: 'duplicate', label: t("notes.create_a_copy"), icon: <Copy size={13}/>, onSelect: () => void duplicateNote(note.id) },
            {
                id: 'share',
                label: t("workspace.share"),
                icon: <Share2 size={13}/>,
                ...(computedIsShared ? {
                    submenu: ({ closeMenu }) => (
                        <ShareNoteSubmenu
                            noteId={note.id}
                            noteTitle={note.title || t("common.untitled_note")}
                            share={noteShare}
                            closeMenu={closeMenu}
                            onOpenSettings={() => setShareModalOpen(true)}
                            onOpenQr={(url, title, slug) => setQrModalData({ url, title, slug })}
                            onOpenAnalytics={() => setAnalyticsOpen(true)}
                        />
                    ),
                } : {
                    onSelect: () => setShareModalOpen(true),
                }),
            },
            {
                id: 'blog',
                label: isBlogPublished ? t("blog.blog_menu") : t("blog.publish_to_blog"),
                icon: <Globe size={13}/>,
                ...(isBlogPublished && noteBlogPost ? {
                    submenu: ({ closeMenu }) => (
                        <BlogNoteSubmenu
                            noteId={note.id}
                            post={noteBlogPost}
                            closeMenu={closeMenu}
                            onOpenSettings={() => setBlogPublishOpen(true)}
                            onOpenStats={() => {
                                useBlogStore.getState().setActiveTab('comments');
                                useUi.getState().openPanel('blog-hub');
                            }}
                        />
                    ),
                } : {
                    onSelect: () => setBlogPublishOpen(true),
                }),
            },
            {
                id: 'archive',
                label: note.isArchived ? t("common.unarchive") : t("navigation.archive"),
                icon: <Archive size={13}/>,
                onSelect: () => void setArchived(note.id, !note.isArchived),
            },
            {
                id: 'move',
                label: t("notes.move_to_folder"),
                icon: <FolderInput size={13}/>,
                separatorBefore: true,
                submenu: ({ closeMenu }) => (
                    <MoveToFolderSubmenu
                        currentFolderId={note.folderId}
                        onSelectFolder={handleSelectFolder}
                        onCreateNew={() => setCreateFolderOpen(true)}
                        onManageFolders={handleManageFolders}
                        closeMenu={closeMenu}
                    />
                ),
            },
            { id: 'export-md', label: t("workspace.export_markdown"), icon: <FileText size={13}/>, separatorBefore: true, onSelect: () => void exportNote('md') },
            { id: 'export-html', label: t("workspace.export_html"), icon: <FileCode size={13}/>, onSelect: () => void exportNote('html') },
            { id: 'export-pdf', label: t("workspace.export_pdf"), icon: <FileDown size={13}/>, onSelect: () => void exportNote('pdf') },
            {
                id: 'delete',
                label: t("common.move_to_trash"),
                icon: <Trash2 size={13}/>,
                tone: 'danger',
                separatorBefore: true,
                onSelect: () => void deleteNote(note.id),
            },
        ];
    const titleParts = splitByRanges(note.title || t("common.untitled_note"), highlight);
    return (<>
      <div id={`note-option-${note.id}`} role="option" aria-selected={active || selected} aria-posinset={position} aria-setsize={total} tabIndex={-1} data-note-id={note.id} draggable style={{ contentVisibility: 'auto', containIntrinsicSize: density === 'compact' ? 'auto 42px' : 'auto 72px' }} onDragStart={(e) => {
            e.dataTransfer.setData('application/x-inkstone-note', note.id);
            if (selectedIds.includes(note.id) && selectedIds.length > 1) {
                e.dataTransfer.setData('application/x-inkstone-notes', JSON.stringify(selectedIds));
            }
            e.dataTransfer.effectAllowed = 'move';
        }} onClick={(event) => {
            if (event.altKey && breakpoint === 'desktop') {
                event.preventDefault();
                void openNote(note.id, { pane: 'secondary' });
                return;
            }
            if (event.metaKey || event.ctrlKey) {
                toggleSelected(note.id, true);
                return;
            }
            if (event.shiftKey) {
                event.preventDefault();
                onRangeSelect(note.id);
                return;
            }
            void openNote(note.id);
        }} onContextMenu={(event) => {
            setMenuOpen(false);
            menu.onContextMenu(event);
        }} className={cn('motion-note-row group relative cursor-default rounded-[var(--r-md)] border border-transparent px-2.5 pr-11 transition-[background-color,border-color,box-shadow,transform] duration-[var(--dur-fast)] md:pr-10', density === 'compact' ? 'py-[7px]' : 'py-2.5', selectionHighlighted
            ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]/40'
            : active
                ? 'border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]'
                : openInSecondary
                    ? 'border-[var(--accent)]/35 bg-[var(--accent-soft)]/45'
                : 'hover:bg-[var(--bg-hover)]')}>
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {note.isPinned && <Pin size={10} className="anim-mark-enter shrink-0 text-[var(--accent)]"/>}
              <h3 className={cn('min-w-0 flex-1 truncate text-[13px] leading-snug', active
            ? 'font-semibold text-[var(--accent)]'
            : 'font-medium text-[var(--text-primary)]')}>
                {titleParts.map((part, i) => part.hit ? (<mark key={i} className="ink-hit">
                      {part.text}
                    </mark>) : (<span key={i}>{part.text}</span>))}
              </h3>
              {showFolderPill && noteFolder && density === 'compact' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFolderView(folders, note.folderId!);
                  }}
                  title={noteFolder.name}
                  className="inline-flex max-w-[120px] shrink-0 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-1.5 py-px text-[10px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                >
                  {noteFolder.color ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: noteFolder.color }}
                    />
                  ) : noteFolder.icon ? (
                    <span className="shrink-0 text-[10px] leading-none">{noteFolder.icon}</span>
                  ) : (
                    <FolderClosed size={9} className="shrink-0 opacity-70" />
                  )}
                  <span className="truncate">{noteFolder.name}</span>
                </button>
              )}
              {note.isStarred && <Star size={10} className="anim-mark-enter shrink-0 fill-current text-[var(--warning)]"/>}
              {computedIsShared && (
                <span title={t("workspace.share")} className="inline-flex items-center">
                  <Share2 size={10} className="anim-mark-enter shrink-0 text-[var(--accent)]" />
                </span>
              )}
              {isBlogPublished && (
                <span title={t("blog.published")} className="inline-flex items-center">
                  <Globe size={10} className="anim-mark-enter shrink-0 text-[var(--accent)]" />
                </span>
              )}
            </div>

            {density === 'comfortable' && note.excerpt && (<p className="truncate-2 mt-1 text-[11.5px] leading-[1.5] text-[var(--text-tertiary)]">
                {note.excerpt}
              </p>)}

            {density === 'comfortable' && (note.tags.length > 0 || (showFolderPill && noteFolder)) && (
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
                {showFolderPill && noteFolder && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFolderView(folders, note.folderId!);
                    }}
                    title={noteFolder.name}
                    className="inline-flex max-w-[140px] items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-2 py-0.5 text-[10.5px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    {noteFolder.color ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: noteFolder.color }}
                      />
                    ) : noteFolder.icon ? (
                      <span className="shrink-0 text-[10px] leading-none">{noteFolder.icon}</span>
                    ) : (
                      <FolderClosed size={10} className="shrink-0 opacity-70" />
                    )}
                    <span className="truncate">{noteFolder.name}</span>
                  </button>
                )}
                {note.tags.map((tag) => (
                  <TagPill
                    key={tag}
                    tag={tag}
                    color={tagColors.get(tag)}
                    size="sm"
                    removable
                    onClick={(e) => {
                      e?.stopPropagation();
                      useUi.getState().openView('tag', { tag });
                    }}
                    onRemove={(e) => {
                      e?.stopPropagation();
                      void removeTagFromNote(note.id, tag);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        {breakpoint === 'desktop' && (<Tooltip label={t("notes.open_to_side")} side="left">
            <IconButton label={t("notes.open_to_side")} size="sm" active={openInSecondary} onClick={(event) => {
                  event.stopPropagation();
                  void openNote(note.id, { pane: 'secondary' });
              }} className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" >
              <Columns2 size={14}/>
            </IconButton>
          </Tooltip>)}
        {breakpoint === 'mobile' && (<Tooltip label={t("common.more_actions")} side="left">
            <IconButton ref={menuButtonRef} label={t("common.more_actions")} size="sm" onClick={(event) => {
                  event.stopPropagation();
                  menu.close();
                  setMenuOpen(true);
              }} className="absolute top-1.5 right-1.5">
              <MoreHorizontal size={16}/>
            </IconButton>
          </Tooltip>)}
      </div>

      {menu.point && <Menu anchor={menu.point} open onClose={menu.close} items={items}/>}
      <Menu anchor={menuButtonRef} open={menuOpen} onClose={() => setMenuOpen(false)} items={items} align="end" width={240}/>
      {createFolderOpen && (
        <CreateFolderModal
          open={createFolderOpen}
          onClose={() => setCreateFolderOpen(false)}
          onCreated={(folderId) => {
            handleSelectFolder(folderId);
          }}
        />
      )}
      {shareModalOpen && (
        <ShareEditModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          noteId={note.id}
          noteTitle={note.title || t("common.untitled_note")}
        />
      )}
      {qrModalData && (
        <ShareQrModal
          open={Boolean(qrModalData)}
          onClose={() => setQrModalData(null)}
          url={qrModalData.url}
          title={qrModalData.title}
          slug={qrModalData.slug}
        />
      )}
      {analyticsOpen && (
        <ShareNoteAnalyticsModal
          open={analyticsOpen}
          onClose={() => setAnalyticsOpen(false)}
          noteId={note.id}
        />
      )}
      {blogPublishOpen && (
        <BlogPublishModal
          open={blogPublishOpen}
          onClose={() => setBlogPublishOpen(false)}
          noteId={note.id}
          post={noteBlogPost}
        />
      )}
    </>);
});

