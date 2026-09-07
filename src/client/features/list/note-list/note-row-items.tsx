import {
  Archive,
  CheckSquare2,
  Columns2,
  Copy,
  FileCode,
  FileDown,
  FileText,
  FolderInput,
  Globe,
  Pin,
  PinOff,
  RotateCcw,
  Share2,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import type { MenuItem } from '../../../components/overlay';
import { t } from '../../../lib/i18n';
import { MoveToFolderSubmenu } from '../../folders';
import { BlogNoteSubmenu, useBlogStore } from '../../blog';
import { ShareNoteSubmenu } from '../../share';
import { useUi } from '../../../store/ui';
import type { NoteRowState } from './note-row-state';
import type { NoteRowActions } from './note-row-actions';

export function useNoteRowMenuItems(state: NoteRowState, actions: NoteRowActions): MenuItem[] {
    if (state.inTrash)
        return trashMenuItems(state, actions);
    return [
        ...noteMenuTopItems(state),
        shareMenuItem(state),
        blogMenuItem(state),
        ...noteMenuBottomItems(state, actions),
    ];
}

function trashMenuItems(state: NoteRowState, actions: NoteRowActions): MenuItem[] {
    const { note, restoreNote } = state;
    return [
        { id: 'restore', label: t('common.restore'), icon: <RotateCcw size={13}/>, onSelect: () => void restoreNote(note.id) },
        {
            id: 'purge',
            label: t('notes.delete_permanently'),
            icon: <Trash2 size={13}/>,
            tone: 'danger',
            separatorBefore: true,
            disabled: actions.isPurging,
            onSelect: () => void actions.purge(),
        },
    ];
}

function noteMenuTopItems(state: NoteRowState): MenuItem[] {
    const { note, breakpoint, selectedIds, toggleSelected, openNote, setPinned, setStarred, duplicateNote } = state;
    return [
        ...(breakpoint === 'desktop' ? [{
            id: 'open-side',
            label: t('notes.open_to_side'),
            icon: <Columns2 size={13}/>,
            onSelect: () => void openNote(note.id, { pane: 'secondary' }),
        } satisfies MenuItem] : []),
        ...(breakpoint === 'mobile' ? [{
            id: 'multi-select',
            label: t('notes.add_to_selection'),
            icon: <CheckSquare2 size={13}/>,
            disabled: selectedIds.includes(note.id),
            onSelect: () => toggleSelected(note.id, true),
        } satisfies MenuItem] : []),
        {
            id: 'pin',
            label: note.isPinned ? t('notes.unpin') : t('notes.pin'),
            icon: note.isPinned ? <PinOff size={13}/> : <Pin size={13}/>,
            onSelect: () => void setPinned(note.id, !note.isPinned),
        },
        {
            id: 'star',
            label: note.isStarred ? t('common.remove_from_favorites') : t('navigation.favorites'),
            icon: note.isStarred ? <StarOff size={13}/> : <Star size={13}/>,
            combo: 'mod+d',
            onSelect: () => void setStarred(note.id, !note.isStarred),
        },
        { id: 'duplicate', label: t('notes.create_a_copy'), icon: <Copy size={13}/>, onSelect: () => void duplicateNote(note.id) },
    ];
}

function shareMenuItem(state: NoteRowState): MenuItem {
    const { note, noteShare, computedIsShared, setIsShareModalOpen, setQrModalData, setIsAnalyticsOpen } = state;
    return {
        id: 'share',
        label: t('workspace.share'),
        icon: <Share2 size={13}/>,
        ...(computedIsShared ? {
            submenu: ({ closeMenu }) => (
                <ShareNoteSubmenu
                    noteId={note.id}
                    noteTitle={note.title || t('common.untitled_note')}
                    share={noteShare}
                    closeMenu={closeMenu}
                    onOpenSettings={() => setIsShareModalOpen(true)}
                    onOpenQr={(url, title, slug) => setQrModalData({ url, title, slug })}
                    onOpenAnalytics={() => setIsAnalyticsOpen(true)}
                />
            ),
        } : {
            onSelect: () => setIsShareModalOpen(true),
        }),
    };
}

function blogMenuItem(state: NoteRowState): MenuItem {
    const { note, noteBlogPost, isBlogPublished, setIsBlogPublishOpen } = state;
    return {
        id: 'blog',
        label: isBlogPublished ? t('blog.blog_menu') : t('blog.publish_to_blog'),
        icon: <Globe size={13}/>,
        ...(isBlogPublished && noteBlogPost ? {
            submenu: ({ closeMenu }) => (
                <BlogNoteSubmenu
                    noteId={note.id}
                    post={noteBlogPost}
                    closeMenu={closeMenu}
                    onOpenSettings={() => setIsBlogPublishOpen(true)}
                    onOpenStats={() => {
                        useBlogStore.getState().setActiveTab('comments');
                        useUi.getState().openPanel('blog-hub');
                    }}
                />
            ),
        } : {
            onSelect: () => setIsBlogPublishOpen(true),
        }),
    };
}

function noteMenuBottomItems(state: NoteRowState, actions: NoteRowActions): MenuItem[] {
    const { note, setArchived, setIsCreateFolderOpen, deleteNote } = state;
    return [
        {
            id: 'archive',
            label: note.isArchived ? t('common.unarchive') : t('navigation.archive'),
            icon: <Archive size={13}/>,
            onSelect: () => void setArchived(note.id, !note.isArchived),
        },
        {
            id: 'move',
            label: t('notes.move_to_folder'),
            icon: <FolderInput size={13}/>,
            separatorBefore: true,
            submenu: ({ closeMenu }) => (
                <MoveToFolderSubmenu
                    currentFolderId={note.folderId}
                    onSelectFolder={actions.handleSelectFolder}
                    onCreateNew={() => setIsCreateFolderOpen(true)}
                    onManageFolders={actions.handleManageFolders}
                    closeMenu={closeMenu}
                />
            ),
        },
        { id: 'export-md', label: t('workspace.export_markdown'), icon: <FileText size={13}/>, separatorBefore: true, onSelect: () => void actions.exportNote('md') },
        { id: 'export-html', label: t('workspace.export_html'), icon: <FileCode size={13}/>, onSelect: () => void actions.exportNote('html') },
        { id: 'export-pdf', label: t('workspace.export_pdf'), icon: <FileDown size={13}/>, onSelect: () => void actions.exportNote('pdf') },
        {
            id: 'delete',
            label: t('common.move_to_trash'),
            icon: <Trash2 size={13}/>,
            tone: 'danger',
            separatorBefore: true,
            onSelect: () => void deleteNote(note.id),
        },
    ];
}