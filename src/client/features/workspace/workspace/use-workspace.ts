import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { type EditorLayout } from '@shared/types';
import { api } from '../../../lib/api';
import { errorMessage } from '../../../lib/errors';
import { detectEditorContext, detectPreviewContext, type EditorContextData, type PreviewContextData } from '../context-menu-detect';
import { useBreakpoint, useRelativeTime } from '../../../lib/hooks';
import { setActiveEditorView } from '../../../editor/commands';
import { optimizeImageFile } from '../../../lib/image';
import { useBlogStore } from '../../blog';
import { useShareStore } from '../../share';
import { type Heading } from '../../../lib/markdown/renderer';
import type { WorkspacePane } from '../../../store/ui';
import { useUi } from '../../../store/ui';
import { useSession } from '../../../store/session';
import { useActiveNote } from '../../../store/notes/selectors';
import { useNotes } from '../../../store/notes';
import { useSyncScroll } from '../sync-scroll';
import { t, useLocale } from '../../../lib/i18n';
import { preferredScrollBehavior } from '../../../lib/motion';

const SPLIT_HANDLE_WIDTH = 1;
const PREVIEW_BORDER_WIDTH = 1;
const OUTLINE_WIDTH = 168;

export function useWorkspace(pane: WorkspacePane | 'active', mobileLayout: 'edit' | 'preview', grouped: boolean) {
    const { note, content, loaded } = useActiveNote(pane);
    const previewSettings = useSession((s) => s.settings.preview);
    const editorSettings = useSession((s) => s.settings.editor);
    const updateSettings = useSession((s) => s.updateSettings);
    const editContent = useNotes((s) => s.editContent);
    const editTitle = useNotes((s) => s.editTitle);
    const patchNote = useNotes((s) => s.patchNote);
    const tags = useNotes((s) => s.tags);
    const folders = useNotes((s) => s.folders);
    const notes = useNotes((s) => s.notes);
    const toast = useUi((s) => s.toast);
    const locale = useLocale();
    const openPanel = useUi((s) => s.openPanel);
    const outlineOpen = useUi((s) => s.outlineOpen);
    const backlinksOpen = useUi((s) => s.backlinksOpen);
    const toggleOutline = useUi((s) => s.toggleOutline);
    const toggleBacklinks = useUi((s) => s.toggleBacklinks);
    const splitRatio = useUi((s) => s.splitRatio);
    const setLayout = useUi((s) => s.setLayout);
    const activeWorkspacePane = useUi((s) => s.activeWorkspacePane);
    const workspacePaneLayouts = useUi((s) => s.workspacePaneLayouts);
    const setWorkspacePaneLayout = useUi((s) => s.setWorkspacePaneLayout);
    const activateWorkspacePane = useUi((s) => s.activateWorkspacePane);
    const closeSecondaryNote = useUi((s) => s.closeSecondaryNote);
    const isShared = useShareStore((s) => Boolean(note && s.shares.some((sh) => sh.noteId === note.id)));
    const isBlogPublished = useBlogStore((s) => Boolean(note && s.posts.some((p) => p.noteId === note.id && p.isPublished)));
    const breakpoint = useBreakpoint();
    const containerRef = useRef<HTMLDivElement>(null);
    const previewScrollerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    const exportMenuRef = useRef<HTMLButtonElement>(null);
    const [view, setViewState] = useState<EditorView | null>(null);
    const setView = useCallback((editorView: EditorView | null) => {
        setViewState(editorView);
        setActiveEditorView(editorView);
    }, []);
    const [headings, setHeadings] = useState<Heading[]>([]);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isMobileOutlineOpen, setIsMobileOutlineOpen] = useState(false);
    const [isAttachmentDriveOpen, setIsAttachmentDriveOpen] = useState(false);
    const [containerWidth, setContainerWidth] = useState(0);
    const [contextMenuPoint, setContextMenuPoint] = useState<{ x: number; y: number } | null>(null);
    const [editorContextData, setEditorContextData] = useState<EditorContextData | null>(null);
    const [previewContextData, setPreviewContextData] = useState<PreviewContextData | null>(null);
    const isMobile = breakpoint === 'mobile';
    const paneActive = !grouped || pane === 'active' || activeWorkspacePane === pane;
    const layout = isMobile
        ? mobileLayout
        : grouped && pane !== 'active'
            ? workspacePaneLayouts[pane]
            : previewSettings.layout;
    const showEditor = layout === 'edit' || layout === 'split';
    const showPreview = layout === 'preview' || layout === 'split';
    const outlineVisible = !isMobile && outlineOpen && paneActive && headings.length > 0;
    const defaultOutlineWidth = outlineVisible ? OUTLINE_WIDTH : 0;
    const defaultContentWidth = Math.max(0, containerWidth - SPLIT_HANDLE_WIDTH - PREVIEW_BORDER_WIDTH - defaultOutlineWidth);
    const defaultEditorWidth = defaultContentWidth / 2;
    const defaultPreviewWidth = PREVIEW_BORDER_WIDTH + defaultOutlineWidth + defaultEditorWidth;
    const effectiveSplitRatio = splitRatio ?? (containerWidth > 0 ? defaultEditorWidth / containerWidth : 0.5);
    const tagColors = useMemo(() => new Map(tags.map((tag) => [tag.name, tag.color])), [tags]);
    const editorWidth = splitRatio === null
        ? containerWidth > 0
            ? `${defaultEditorWidth}px`
            : `calc((100% - ${SPLIT_HANDLE_WIDTH + PREVIEW_BORDER_WIDTH + defaultOutlineWidth}px) / 2)`
        : `${splitRatio * 100}%`;
    const previewWidth = splitRatio === null
        ? containerWidth > 0
            ? `${defaultPreviewWidth}px`
            : `calc((100% + ${PREVIEW_BORDER_WIDTH + defaultOutlineWidth - SPLIT_HANDLE_WIDTH}px) / 2)`
        : `${(1 - splitRatio) * 100}%`;
    const updatedTime = useRelativeTime(note?.updatedAt ?? 0, Boolean(note));
    useLayoutEffect(() => {
        setHeadings([]);
        setIsMobileOutlineOpen(false);
    }, [note?.id, showPreview]);
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;
        const measure = () => {
            const next = container.getBoundingClientRect().width;
            setContainerWidth((current) => Math.abs(current - next) < 0.5 ? current : next);
        };
        measure();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        return () => observer.disconnect();
    }, [loaded, note?.id]);
    const setEditorLayout = (next: EditorLayout) => {
        if (grouped && pane !== 'active') {
            setWorkspacePaneLayout(pane, next);
            return;
        }
        void updateSettings({ preview: { layout: next } });
    };
    const sources = useMemo(() => ({
        notes: () => Object.values(notes)
            .filter((n) => !n.deletedAt && n.id !== note?.id)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 300)
            .map((n) => ({ id: n.id, title: n.title, excerpt: n.excerpt })),
        tags: () => tags.map((t) => ({ name: t.name, count: t.count, color: t.color, isPinned: Boolean(t.isPinned) })),
    }), [notes, tags, note?.id]);
    const handlers = useMemo(() => ({
        uploadFile: async (file: File) => {
            try {
                const isImage = file.type.startsWith('image/');
                const payload = isImage ? await optimizeImageFile(file) : file;
                const uploaded = await api.files.upload(payload, note?.id);
                return {
                    url: uploaded.url,
                    filename: uploaded.filename,
                    isImage: uploaded.mime.startsWith('image/'),
                };
            }
            catch (err) {
                toast({
                    title: t("workspace.upload_failed"),
                    description: errorMessage(err),
                    tone: 'danger',
                });
                return null;
            }
        },
        replaceDetachedUpload: (placeholder: string, replacement: string) => {
            const noteId = note?.id;
            if (!noteId)
                return;
            const state = useNotes.getState();
            const source = state.contents[noteId];
            const at = source?.indexOf(placeholder) ?? -1;
            if (source === undefined || at < 0)
                return;
            state.editContent(noteId, `${source.slice(0, at)}${replacement}${source.slice(at + placeholder.length)}`);
        },
    }), [note?.id, toast]);
    const onChange = useCallback((next: string) => {
        if (!note)
            return;
        editContent(note.id, next);
    }, [note, editContent]);
    const runEditorCommand = useCallback((command: (target: EditorView) => boolean) => {
        if (!view)
            return;
        command(view);
        view.focus();
    }, [view]);
    const invalidateSyncAnchors = useSyncScroll(view, previewScrollerRef, previewSettings.syncScroll && layout === 'split');
    const jumpToHeading = useCallback((heading: Heading) => {
        if (view) {
            const line = Math.min(view.state.doc.lines, heading.line + 1);
            const pos = view.state.doc.line(line).from;
            view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        }
        const target = previewScrollerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(heading.slug)}`);
        target?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start', inline: 'nearest' });
    }, [view]);

    const handleJumpToLine = useCallback((lineNumber: number) => {
        if (layout === 'preview') {
            setEditorLayout('split');
        }
        if (view) {
            const line = Math.min(view.state.doc.lines, Math.max(1, lineNumber + 1));
            const pos = view.state.doc.line(line).from;
            view.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true });
            view.focus();
        }
    }, [view, layout]);

    const handleEditorContextMenu = useCallback((event: MouseEvent, editorView: EditorView) => {
        const pos = editorView.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos !== null) {
            const sel = editorView.state.selection.main;
            if (sel.empty || pos < sel.from || pos > sel.to) {
                editorView.dispatch({ selection: EditorSelection.cursor(pos) });
            }
            const ctx = detectEditorContext(editorView, pos);
            setEditorContextData(ctx);
        } else {
            const ctx = detectEditorContext(editorView, editorView.state.selection.main.head);
            setEditorContextData(ctx);
        }
        setPreviewContextData(null);
        setContextMenuPoint({ x: event.clientX, y: event.clientY });
    }, []);

    const handlePreviewContextMenu = useCallback((_event: React.MouseEvent, target: HTMLElement) => {
        const ctx = detectPreviewContext(target);
        setPreviewContextData(ctx);
        setEditorContextData(null);
        setContextMenuPoint({ x: _event.clientX, y: _event.clientY });
    }, []);

    const closeContextMenu = useCallback(() => {
        setContextMenuPoint(null);
        setEditorContextData(null);
        setPreviewContextData(null);
    }, []);
    useEffect(() => {
        if (!note || !paneActive)
            return;
        const frame = window.requestAnimationFrame(() => {
            if (!note.title)
                titleInputRef.current?.focus();
            else
                view?.focus();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [note?.id, paneActive, view]);
  return {
note,
content,
loaded,
editorSettings,
editTitle,
patchNote,
tags,
folders,
toast,
locale,
openPanel,
outlineOpen,
backlinksOpen,
toggleOutline,
toggleBacklinks,
splitRatio,
setLayout,
activateWorkspacePane,
closeSecondaryNote,
isShared,
isBlogPublished,
containerRef,
previewScrollerRef,
imageInputRef,
fileInputRef,
titleInputRef,
moreButtonRef,
exportMenuRef,
view,
setView,
headings,
setHeadings,
isMoreMenuOpen,
setIsMoreMenuOpen,
isExportMenuOpen,
setIsExportMenuOpen,
isMobileOutlineOpen,
setIsMobileOutlineOpen,
isAttachmentDriveOpen,
setIsAttachmentDriveOpen,
contextMenuPoint,
editorContextData,
previewContextData,
isMobile,
paneActive,
layout,
showEditor,
showPreview,
outlineVisible,
effectiveSplitRatio,
tagColors,
editorWidth,
previewWidth,
updatedTime,
setEditorLayout,
sources,
handlers,
onChange,
runEditorCommand,
invalidateSyncAnchors,
jumpToHeading,
handleJumpToLine,
handleEditorContextMenu,
handlePreviewContextMenu,
closeContextMenu,
  };
}
