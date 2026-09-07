import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { type AppLocale, type EditorLayout, type NoteSummary } from '@shared/types';
import { api } from '../../../lib/api';
import { errorMessage } from '../../../lib/errors';
import { exportNoteAsHtml, exportNoteAsMarkdown, exportNoteAsPdf } from '../../../lib/export-note';
import { detectEditorContext, detectPreviewContext, type EditorContextData, type PreviewContextData } from '../context-menu-detect';
import { useBreakpoint, useRelativeTime } from '../../../lib/hooks';
import { setActiveEditorView } from '../../../editor/commands';
import { optimizeImageFile } from '../../../lib/image';
import { useBlogStore } from '../../blog';
import { useShareStore } from '../../share';
import { type Heading } from '../../../lib/markdown/renderer';
import type { WorkspacePane, UiState } from '../../../store/ui';
import { useUi } from '../../../store/ui';
import { useSession } from '../../../store/session';
import { useActiveNote, useNotes, type NotesState } from '../../../store/notes';
import { useSyncScroll } from '../sync-scroll';
import { t, useLocale } from '../../../lib/i18n';
import { preferredScrollBehavior } from '../../../lib/motion';

async function runExport(format: 'md' | 'html' | 'pdf', title: string, content: string, locale: AppLocale, toast: UiState['toast']) {
  const payload = { title, content };
  if (format === 'md') {
    exportNoteAsMarkdown(payload);
    return;
  }
  try {
    if (format === 'html') await exportNoteAsHtml(payload, locale);
    else await exportNoteAsPdf(payload, locale);
  }
  catch (err) {
    toast({ title: t('workspace.export_failed'), description: errorMessage(err), tone: 'danger' });
  }
}

const SPLIT_HANDLE_WIDTH = 1;
const PREVIEW_BORDER_WIDTH = 1;
const OUTLINE_WIDTH = 168;

function useWorkspaceStore(pane: WorkspacePane | 'active') {
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
  return {
    note, content, loaded,
    previewSettings, editorSettings, updateSettings,
    editContent, editTitle, patchNote, tags, folders, notes,
    toast, locale,
    openPanel, outlineOpen, backlinksOpen, toggleOutline, toggleBacklinks,
    splitRatio, setLayout, activeWorkspacePane, workspacePaneLayouts, setWorkspacePaneLayout, activateWorkspacePane, closeSecondaryNote,
    isShared, isBlogPublished,
    breakpoint,
  };
}

function useWorkspaceRefs() {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewScrollerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const exportMenuRef = useRef<HTMLButtonElement>(null);
  return { containerRef, previewScrollerRef, imageInputRef, fileInputRef, titleInputRef, moreButtonRef, exportMenuRef };
}

function useWorkspaceLocalState() {
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
  return {
    view, setView,
    headings, setHeadings,
    isMoreMenuOpen, setIsMoreMenuOpen,
    isExportMenuOpen, setIsExportMenuOpen,
    isMobileOutlineOpen, setIsMobileOutlineOpen,
    isAttachmentDriveOpen, setIsAttachmentDriveOpen,
    containerWidth, setContainerWidth,
  };
}

function computeWorkspaceLayout(opts: {
  isMobile: boolean;
  mobileLayout: 'edit' | 'preview';
  grouped: boolean;
  pane: WorkspacePane | 'active';
  workspacePaneLayouts: UiState['workspacePaneLayouts'];
  previewSettings: { layout: EditorLayout };
  outlineOpen: boolean;
  paneActive: boolean;
  headings: Heading[];
  containerWidth: number;
  splitRatio: number | null;
}) {
  const { isMobile, mobileLayout, grouped, pane, workspacePaneLayouts, previewSettings, outlineOpen, paneActive, headings, containerWidth, splitRatio } = opts;
  const layout = isMobile ? mobileLayout : grouped && pane !== 'active' ? workspacePaneLayouts[pane] : previewSettings.layout;
  const showEditor = layout === 'edit' || layout === 'split';
  const showPreview = layout === 'preview' || layout === 'split';
  const outlineVisible = !isMobile && outlineOpen && paneActive && headings.length > 0;
  const defaultOutlineWidth = outlineVisible ? OUTLINE_WIDTH : 0;
  const defaultContentWidth = Math.max(0, containerWidth - SPLIT_HANDLE_WIDTH - PREVIEW_BORDER_WIDTH - defaultOutlineWidth);
  const defaultEditorWidth = defaultContentWidth / 2;
  const defaultPreviewWidth = PREVIEW_BORDER_WIDTH + defaultOutlineWidth + defaultEditorWidth;
  const effectiveSplitRatio = splitRatio ?? (containerWidth > 0 ? defaultEditorWidth / containerWidth : 0.5);
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
  return { layout, showEditor, showPreview, outlineVisible, effectiveSplitRatio, editorWidth, previewWidth };
}

function useWorkspaceEffects(opts: {
  note: NotesState['notes'][string] | null | undefined;
  showPreview: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  loaded: boolean;
  paneActive: boolean;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  view: EditorView | null;
  setHeadings: (headings: Heading[]) => void;
  setIsMobileOutlineOpen: (open: boolean) => void;
  setContainerWidth: (width: number | ((current: number) => number)) => void;
}) {
  const { note, showPreview, containerRef, loaded, paneActive, titleInputRef, view, setHeadings, setIsMobileOutlineOpen, setContainerWidth } = opts;

  useLayoutEffect(() => {
    setHeadings([]);
    setIsMobileOutlineOpen(false);
  }, [note?.id, showPreview]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const next = container.getBoundingClientRect().width;
      setContainerWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
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

  useEffect(() => {
    if (!note || !paneActive) return;
    const frame = window.requestAnimationFrame(() => {
      if (!note.title) titleInputRef.current?.focus();
      else view?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [note?.id, paneActive, view]);
}

function useWorkspaceCommands(opts: {
  note: NotesState['notes'][string] | null | undefined;
  editContent: NotesState['editContent'];
  view: EditorView | null;
  layout: EditorLayout;
  grouped: boolean;
  pane: WorkspacePane | 'active';
  setWorkspacePaneLayout: UiState['setWorkspacePaneLayout'];
  updateSettings: (patch: { preview: { layout: EditorLayout } }) => void;
  previewScrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { note, editContent, view, layout, grouped, pane, setWorkspacePaneLayout, updateSettings, previewScrollerRef } = opts;

  const setEditorLayout = (next: EditorLayout) => {
    if (grouped && pane !== 'active') {
      setWorkspacePaneLayout(pane, next);
      return;
    }
    void updateSettings({ preview: { layout: next } });
  };

  const onChange = useCallback((next: string) => {
    if (!note) return;
    editContent(note.id, next);
  }, [note, editContent]);

  const runEditorCommand = useCallback((command: (target: EditorView) => boolean) => {
    if (!view) return;
    command(view);
    view.focus();
  }, [view]);

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
    if (layout === 'preview') setEditorLayout('split');
    if (view) {
      const line = Math.min(view.state.doc.lines, Math.max(1, lineNumber + 1));
      const pos = view.state.doc.line(line).from;
      view.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true });
      view.focus();
    }
  }, [view, layout]);

  return { setEditorLayout, onChange, runEditorCommand, jumpToHeading, handleJumpToLine };
}

function useWorkspaceContextMenu() {
  const [contextMenuPoint, setContextMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const [editorContextData, setEditorContextData] = useState<EditorContextData | null>(null);
  const [previewContextData, setPreviewContextData] = useState<PreviewContextData | null>(null);

  const handleEditorContextMenu = useCallback((event: MouseEvent, editorView: EditorView) => {
    const pos = editorView.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos !== null) {
      const sel = editorView.state.selection.main;
      if (sel.empty || pos < sel.from || pos > sel.to) {
        editorView.dispatch({ selection: EditorSelection.cursor(pos) });
      }
      setEditorContextData(detectEditorContext(editorView, pos));
    } else {
      setEditorContextData(detectEditorContext(editorView, editorView.state.selection.main.head));
    }
    setPreviewContextData(null);
    setContextMenuPoint({ x: event.clientX, y: event.clientY });
  }, []);

  const handlePreviewContextMenu = useCallback((event: React.MouseEvent, target: HTMLElement) => {
    setPreviewContextData(detectPreviewContext(target));
    setEditorContextData(null);
    setContextMenuPoint({ x: event.clientX, y: event.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuPoint(null);
    setEditorContextData(null);
    setPreviewContextData(null);
  }, []);

  return { contextMenuPoint, editorContextData, previewContextData, handleEditorContextMenu, handlePreviewContextMenu, closeContextMenu };
}

function buildWorkspaceSources(notes: NotesState['notes'], tags: NotesState['tags'], note: NotesState['notes'][string] | null | undefined) {
  return {
    notes: () => Object.values(notes)
      .filter((n) => !n.deletedAt && n.id !== note?.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 300)
      .map((n) => ({ id: n.id, title: n.title, excerpt: n.excerpt })),
    tags: () => tags.map((t) => ({ name: t.name, count: t.count, color: t.color, isPinned: Boolean(t.isPinned) })),
  };
}

function buildWorkspaceHandlers(note: NotesState['notes'][string] | null | undefined, toast: UiState['toast']) {
  return {
    uploadFile: async (file: File) => {
      try {
        const isImage = file.type.startsWith('image/');
        const payload = isImage ? await optimizeImageFile(file) : file;
        const uploaded = await api.files.upload(payload, note?.id);
        return { url: uploaded.url, filename: uploaded.filename, isImage: uploaded.mime.startsWith('image/') };
      } catch (err) {
        toast({ title: t('workspace.upload_failed'), description: errorMessage(err), tone: 'danger' });
        return null;
      }
    },
    replaceDetachedUpload: (placeholder: string, replacement: string) => {
      const noteId = note?.id;
      if (!noteId) return;
      const state = useNotes.getState();
      const source = state.contents[noteId];
      const at = source?.indexOf(placeholder) ?? -1;
      if (source === undefined || at < 0) return;
      state.editContent(noteId, `${source.slice(0, at)}${replacement}${source.slice(at + placeholder.length)}`);
    },
  };
}

export function useWorkspace(pane: WorkspacePane | 'active', mobileLayout: 'edit' | 'preview', grouped: boolean) {
  const store = useWorkspaceStore(pane);
  const refs = useWorkspaceRefs();
  const local = useWorkspaceLocalState();
  const isMobile = store.breakpoint === 'mobile';
  const paneActive = !grouped || pane === 'active' || store.activeWorkspacePane === pane;
  const derived = computeWorkspaceLayout({ isMobile, mobileLayout, grouped, pane, workspacePaneLayouts: store.workspacePaneLayouts, previewSettings: store.previewSettings, outlineOpen: store.outlineOpen, paneActive, headings: local.headings, containerWidth: local.containerWidth, splitRatio: store.splitRatio });
  const tagColors = useMemo(() => new Map(store.tags.map((tag) => [tag.name, tag.color])), [store.tags]);
  const updatedTime = useRelativeTime(store.note?.updatedAt ?? 0, Boolean(store.note));
  const cmds = useWorkspaceCommands({ note: store.note, editContent: store.editContent, view: local.view, layout: derived.layout, grouped, pane, setWorkspacePaneLayout: store.setWorkspacePaneLayout, updateSettings: store.updateSettings, previewScrollerRef: refs.previewScrollerRef });
  const menu = useWorkspaceContextMenu();
  const exportNote = useCallback(async (format: 'md' | 'html' | 'pdf') => {
    local.setIsExportMenuOpen(false);
    if (!store.note) return;
    await runExport(format, store.note.title, store.content, store.locale, store.toast);
  }, [local.setIsExportMenuOpen, store.note?.id, store.content, store.locale, store.toast]);
  const sources = useMemo(() => buildWorkspaceSources(store.notes, store.tags, store.note), [store.notes, store.tags, store.note?.id]);
  const handlers = useMemo(() => buildWorkspaceHandlers(store.note, store.toast), [store.note?.id, store.toast]);
  const invalidateSyncAnchors = useSyncScroll(local.view, refs.previewScrollerRef, store.previewSettings.syncScroll && derived.layout === 'split');
  useWorkspaceEffects({ note: store.note, showPreview: derived.showPreview, containerRef: refs.containerRef, loaded: store.loaded, paneActive, titleInputRef: refs.titleInputRef, view: local.view, setHeadings: local.setHeadings, setIsMobileOutlineOpen: local.setIsMobileOutlineOpen, setContainerWidth: local.setContainerWidth });

  return {
    pane,
    note: store.note, content: store.content, loaded: store.loaded,
    editorSettings: store.editorSettings, editTitle: store.editTitle, patchNote: store.patchNote,
    tags: store.tags, folders: store.folders, toast: store.toast, locale: store.locale,
    openPanel: store.openPanel, outlineOpen: store.outlineOpen, backlinksOpen: store.backlinksOpen,
    toggleOutline: store.toggleOutline, toggleBacklinks: store.toggleBacklinks,
    splitRatio: store.splitRatio, setLayout: store.setLayout,
    activateWorkspacePane: store.activateWorkspacePane, closeSecondaryNote: store.closeSecondaryNote,
    isShared: store.isShared, isBlogPublished: store.isBlogPublished,
    ...refs,
    view: local.view, setView: local.setView, headings: local.headings, setHeadings: local.setHeadings,
    isMoreMenuOpen: local.isMoreMenuOpen, setIsMoreMenuOpen: local.setIsMoreMenuOpen,
    isExportMenuOpen: local.isExportMenuOpen, setIsExportMenuOpen: local.setIsExportMenuOpen,
    isMobileOutlineOpen: local.isMobileOutlineOpen, setIsMobileOutlineOpen: local.setIsMobileOutlineOpen,
    isAttachmentDriveOpen: local.isAttachmentDriveOpen, setIsAttachmentDriveOpen: local.setIsAttachmentDriveOpen,
    isMobile, paneActive,
    ...derived,
    tagColors, updatedTime,
    sources, handlers,
    onChange: cmds.onChange, runEditorCommand: cmds.runEditorCommand,
    invalidateSyncAnchors, jumpToHeading: cmds.jumpToHeading, handleJumpToLine: cmds.handleJumpToLine,
    setEditorLayout: cmds.setEditorLayout,
    ...menu,
    exportNote,
  };
}

export type WorkspaceBundle = Omit<ReturnType<typeof useWorkspace>, 'note'> & { note: NoteSummary }