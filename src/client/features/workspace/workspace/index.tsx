import { ArrowLeft, Columns2, Download, Eye, FileCode, FileDown, FileText, FolderClosed, Globe, Hash, History, LayoutGrid, LinkIcon, ListTree, MoreHorizontal, PanelRightClose, Paperclip, Pencil, Share2, Star, X } from 'lucide-react';
import { readingMinutes } from '@shared/markdown-utils';
import { LIMITS } from '@shared/constants';
import { cn } from '../../../lib/cn';
import { errorMessage } from '../../../lib/errors';
import { EditorContextMenu } from '../editor-context-menu';
import { fullTime } from '../../../lib/time';
import { IconButton } from '../../../components/primitives';
import { Drawer, Menu, Tooltip, type MenuItem } from '../../../components/overlay';
import { Segmented } from '../../../components/form';
import { EditorSkeleton } from '../../../components/feedback';
import { CodeEditor } from '../../../editor/code-editor';
import { insertFiles } from '../../../editor/paste';
import { exportNoteAsHtml, exportNoteAsMarkdown, exportNoteAsPdf } from '../../../lib/export-note';
import { Outline, Preview } from '../../preview';
import { SplitResizer, SaveIndicator } from '../../shell';
import { EditorToolbar } from '../editor-toolbar';
import { BacklinksPanel } from '../backlinks-panel';
import { AttachmentDriveModal } from '../../attachments';
import type { WorkspacePane } from '../../../store/ui';
import { useUi } from '../../../store/ui';
import { createContextualNote } from '../../../store/notes/selectors';
import { folderPathLabel, openFolderView } from '../../../lib/folders';
import { t } from '../../../lib/i18n';
import { NoNoteSelected } from './no-note-selected';
import { useWorkspace } from './use-workspace';

export function Workspace({ mobileLayout = 'edit', onMobileBack, pane = 'active', grouped = false, }: {
    mobileLayout?: 'edit' | 'preview';
    onMobileBack?: () => void;
    pane?: WorkspacePane | 'active';
    grouped?: boolean;
} = {}) {
  const {
    note,
    content,
    loaded,
    editorSettings,
    editTitle,
    patchNote,
    folders,
    toast,
    locale,
    openPanel,
    outlineOpen,
    backlinksOpen,
    toggleOutline,
    toggleBacklinks,
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
  } = useWorkspace(pane, mobileLayout, grouped);

        if (!note)
            return <NoNoteSelected onCreate={() => void createContextualNote()}/>;
    if (!loaded) {
        return (<div className="h-full overflow-hidden bg-[var(--bg-editor)]" aria-busy="true" aria-label={t("workspace.loading_note_content")}>
        <EditorSkeleton />
      </div>);
    }
    const noteFolder = note.folderId ? folders.find((folder) => folder.id === note.folderId) ?? null : null;
    const noteFolderPath = note.folderId ? folderPathLabel(folders, note.folderId) : '';
    const exportNote = async (format: 'md' | 'html' | 'pdf') => {
        setIsExportMenuOpen(false);
        if (!note)
            return;
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
                title: t("workspace.export_failed"),
                description: errorMessage(err),
                tone: 'danger',
            });
        }
    };
    const exportMenuItems: MenuItem[] = [
        { id: 'md', label: t("workspace.export_markdown"), icon: <FileText size={13}/>, onSelect: () => void exportNote('md') },
        { id: 'html', label: t("workspace.export_html"), icon: <FileCode size={13}/>, onSelect: () => void exportNote('html') },
        { id: 'pdf', label: t("workspace.export_pdf"), icon: <FileDown size={13}/>, onSelect: () => void exportNote('pdf') },
    ];
    const mobileItems: MenuItem[] = [
        {
            id: 'versions',
            label: t("common.version_history"),
            icon: <History size={13}/>,
            onSelect: () => openPanel('versions'),
        },
        {
            id: 'share',
            label: t("workspace.share"),
            icon: <Share2 size={13}/>,
            onSelect: () => openPanel('share'),
        },
        {
            id: 'share-hub',
            label: t("share.manage_shares"),
            icon: <LayoutGrid size={13}/>,
            onSelect: () => openPanel('share-hub'),
        },
        {
            id: 'blog-publish',
            label: t("blog.publish_to_blog"),
            icon: <Globe size={13}/>,
            onSelect: () => openPanel('blog-publish'),
        },
        {
            id: 'blog-hub',
            label: t("blog.blog_hub"),
            icon: <Globe size={13}/>,
            onSelect: () => openPanel('blog-hub'),
        },
        {
            id: 'export-md',
            label: t("workspace.export_markdown"),
            icon: <FileText size={13}/>,
            onSelect: () => void exportNote('md'),
        },
        {
            id: 'export-html',
            label: t("workspace.export_html"),
            icon: <FileCode size={13}/>,
            onSelect: () => void exportNote('html'),
        },
        {
            id: 'export-pdf',
            label: t("workspace.export_pdf"),
            icon: <FileDown size={13}/>,
            onSelect: () => void exportNote('pdf'),
        },
    ];
    const groupedItems: MenuItem[] = [
        { id: 'layout-edit', label: t("workspace.edit_only"), checked: layout === 'edit', onSelect: () => setEditorLayout('edit') },
        { id: 'layout-split', label: t("workspace.split_view"), checked: layout === 'split', onSelect: () => setEditorLayout('split') },
        { id: 'layout-preview', label: t("workspace.preview_only"), checked: layout === 'preview', onSelect: () => setEditorLayout('preview') },
        {
            id: 'star',
            label: note.isStarred ? t("common.remove_from_favorites") : t("navigation.favorites"),
            icon: <Star size={13}/>,
            separatorBefore: true,
            onSelect: () => void patchNote(note.id, { isStarred: !note.isStarred }),
        },
        {
            id: 'backlinks',
            label: t("common.backlinks"),
            icon: <LinkIcon size={13}/>,
            checked: backlinksOpen && paneActive,
            onSelect: toggleBacklinks,
        },
        ...(showPreview ? [{
            id: 'outline',
            label: t("common.outline"),
            icon: <ListTree size={13}/>,
            checked: outlineOpen && paneActive,
            onSelect: toggleOutline,
        } satisfies MenuItem] : []),
        ...mobileItems,
    ];
    const activatePane = () => {
        if (grouped && pane !== 'active' && !paneActive)
            activateWorkspacePane(pane);
    };
    return (<div role={grouped ? 'region' : undefined} aria-label={grouped ? (pane === 'secondary' ? t("workspace.right_note_pane") : t("workspace.left_note_pane")) : undefined} data-workspace-pane={grouped ? pane : undefined} onPointerDownCapture={activatePane} onFocusCapture={activatePane} className={cn('flex h-full min-h-0 flex-col bg-[var(--bg-editor)]', grouped && paneActive && 'shadow-[inset_0_2px_0_var(--accent)]')}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
        {isMobile && onMobileBack && (<Tooltip label={t("workspace.back_to_notes")} side="right">
            <IconButton label={t("workspace.back_to_notes")} size="sm" onClick={onMobileBack}>
              <ArrowLeft size={16}/>
            </IconButton>
          </Tooltip>)}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <input
            ref={titleInputRef}
            type="text"
            value={note.title}
            maxLength={LIMITS.titleMaxLength}
            aria-label={t("workspace.note_title")}
            placeholder={t("common.untitled_note")}
            className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[length:var(--text-14)] font-semibold tracking-[-0.01em] text-[var(--text-primary)] outline-none transition-colors placeholder:font-medium placeholder:text-[var(--text-quaternary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] focus:border-[var(--accent)] focus:bg-[var(--bg-surface)]"
            onChange={(event) => editTitle(note.id, event.target.value)}
            onBlur={(event) => editTitle(note.id, event.currentTarget.value.trim())}
            onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (view) view.focus();
                else event.currentTarget.blur();
            }}
          />
          {note.isStarred && <Star size={11} className="shrink-0 fill-current text-[var(--warning)]"/>}
          {isShared && (
            <span title={t("workspace.share")} className="inline-flex items-center">
              <Share2 size={11} className="shrink-0 text-[var(--accent)]" />
            </span>
          )}
          {isBlogPublished && (
            <span title={t("blog.published")} className="inline-flex items-center">
              <Globe size={11} className="shrink-0 text-[var(--accent)]" />
            </span>
          )}
          {!grouped && (<span className="hidden shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)] md:inline">
              {updatedTime}
            </span>)}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {grouped ? (<>
            <div className="mr-1 hidden 2xl:block">
              <Segmented label={t("workspace.layout")} size="sm" value={layout} onChange={setEditorLayout} options={[
                { value: 'edit', label: <Pencil size={12.5}/>, title: t("workspace.edit_only") },
                { value: 'split', label: <Columns2 size={12.5}/>, title: t("workspace.split_view") },
                { value: 'preview', label: <Eye size={12.5}/>, title: t("workspace.preview_only") },
              ]}/>
            </div>
            <Tooltip label={t("common.more_actions")} side="left">
              <IconButton ref={moreButtonRef} label={t("common.more_actions")} size="sm" onClick={() => setIsMoreMenuOpen(true)}>
                <MoreHorizontal size={16}/>
              </IconButton>
            </Tooltip>
            {pane === 'secondary' && (<Tooltip label={t("workspace.close_right_note")} side="left">
                <IconButton label={t("workspace.close_right_note")} size="sm" onClick={closeSecondaryNote}>
                  <X size={15}/>
                </IconButton>
              </Tooltip>)}
          </>) : (<>
          <span className="mr-1 hidden xl:inline-flex">
            <SaveIndicator />
          </span>
          <div className="mr-1 hidden lg:block">
            <Segmented label={t("workspace.layout")} size="sm" value={layout} onChange={setEditorLayout} options={[
            { value: 'edit', label: <Pencil size={12.5}/>, title: t("workspace.edit_only") },
            { value: 'split', label: <Columns2 size={12.5}/>, title: t("workspace.split_view"), combo: 'mod+\\' },
            { value: 'preview', label: <Eye size={12.5}/>, title: t("workspace.preview_only") },
        ]}/>
          </div>
          <Tooltip label={note.isStarred ? t("common.remove_from_favorites") : t("navigation.favorites")} combo="mod+d">
            <IconButton label={note.isStarred ? t("common.remove_from_favorites") : t("navigation.favorites")} size="sm" active={note.isStarred} onClick={() => void patchNote(note.id, { isStarred: !note.isStarred })}>
              <Star size={14} className={note.isStarred ? 'fill-current' : undefined}/>
            </IconButton>
          </Tooltip>
          <Tooltip label={t("attachments.manage")}>
            <IconButton label={t("attachments.manage")} size="sm" active={isAttachmentDriveOpen} onClick={() => setIsAttachmentDriveOpen(true)}>
              <Paperclip size={14}/>
            </IconButton>
          </Tooltip>
          <Tooltip label={t("common.backlinks")}>
            <IconButton label={t("common.backlinks")} size="sm" active={backlinksOpen} onClick={toggleBacklinks}>
              <LinkIcon size={14}/>
            </IconButton>
          </Tooltip>
          {!isMobile && (<Tooltip label={t("common.version_history")}>
              <IconButton label={t("common.version_history")} size="sm" onClick={() => openPanel('versions')}>
                <History size={14}/>
              </IconButton>
            </Tooltip>)}
          {!isMobile && (<>
              <Tooltip label={t("workspace.export")}>
                <IconButton ref={exportMenuRef} label={t("workspace.export")} size="sm" onClick={() => setIsExportMenuOpen(true)}>
                  <Download size={14}/>
                </IconButton>
              </Tooltip>
              <Menu anchor={exportMenuRef} open={isExportMenuOpen} onClose={() => setIsExportMenuOpen(false)} items={exportMenuItems} align="end" width={200}/>
            </>)}
          {showPreview && (<Tooltip label={t("common.outline")} combo="mod+shift+o">
              <IconButton label={t("common.outline")} size="sm" active={isMobile ? isMobileOutlineOpen : outlineOpen} onClick={() => isMobile ? setIsMobileOutlineOpen((open) => !open) : toggleOutline()}>
                {(isMobile ? isMobileOutlineOpen : outlineOpen) ? <PanelRightClose size={14}/> : <ListTree size={14}/>}
              </IconButton>
            </Tooltip>)}
          {!isMobile && (<Tooltip label={t("workspace.share")}>
              <IconButton label={t("workspace.share")} size="sm" onClick={() => openPanel('share')}>
                <Share2 size={14}/>
              </IconButton>
            </Tooltip>)}
          {isMobile && (<Tooltip label={t("common.more_actions")} side="left">
              <IconButton ref={moreButtonRef} label={t("common.more_actions")} size="sm" onClick={() => setIsMoreMenuOpen(true)}>
                <MoreHorizontal size={16}/>
              </IconButton>
            </Tooltip>)}
          </>)}
        </div>
      </header>

      {editorSettings.showToolbar && showEditor && (
        <EditorToolbar
          runCommand={runEditorCommand}
          mobile={isMobile}
          onPickImage={() => imageInputRef.current?.click()}
          onPickFile={() => fileInputRef.current?.click()}
        />
      )}

      <div ref={containerRef} className="flex min-h-0 flex-1">
        {showEditor && (<div className="min-w-0" style={{ width: layout === 'split' ? editorWidth : '100%' }}>
            <CodeEditor key={note.id} value={content} onChange={onChange} settings={editorSettings} sources={sources} handlers={handlers} noteId={note.id} onReady={setView} onContextMenu={handleEditorContextMenu}/>
          </div>)}

        {layout === 'split' && (<SplitResizer label={t("workspace.resize_editor_and_preview_panes")} containerRef={containerRef} ratio={effectiveSplitRatio} onChange={(splitRatio) => setLayout({ splitRatio })} onReset={() => setLayout({ splitRatio: null })}/>)}

        {showPreview && (<div className={cn('flex min-w-0 overflow-hidden border-l border-[var(--border-subtle)] bg-[var(--bg-editor)]', layout === 'preview' && 'flex-1 border-l-0')} style={{ width: layout === 'split' ? previewWidth : undefined }}>
            <Preview key={note.id} content={content} noteId={note.id} noteTitle={note.title} onHeadings={setHeadings} scrollerRef={previewScrollerRef} onRendered={invalidateSyncAnchors} onContextMenu={handlePreviewContextMenu} className="min-w-0 flex-1"/>
            {outlineVisible && (<Outline headings={headings} onSelect={jumpToHeading} scrollerRef={previewScrollerRef}/>)}
          </div>)}
      </div>

      {backlinksOpen && paneActive && <BacklinksPanel noteId={note.id}/>}

      <EditorContextMenu
        point={contextMenuPoint}
        onClose={closeContextMenu}
        editorView={view}
        editorContext={editorContextData}
        previewContext={previewContextData}
        content={content}
        noteId={note.id}
        noteTitle={note.title}
        onEditContent={onChange}
        onJumpToLine={handleJumpToLine}
        onPickImage={() => imageInputRef.current?.click()}
        onPickFile={() => fileInputRef.current?.click()}
        onSwitchLayout={setEditorLayout}
        currentLayout={layout}
        previewScrollerRef={previewScrollerRef}
        onExport={exportNote}
      />

      <Menu anchor={moreButtonRef} open={isMoreMenuOpen} onClose={() => setIsMoreMenuOpen(false)} items={grouped ? groupedItems : mobileItems} align="end" width={220}/>
      {isMobile && showPreview && (<Drawer open={isMobileOutlineOpen} onClose={() => setIsMobileOutlineOpen(false)} side="right" width={320} title={t("common.outline")}>
          <Outline headings={headings} scrollerRef={previewScrollerRef} className="max-h-none w-full self-stretch py-3" onSelect={(heading) => {
                jumpToHeading(heading);
                setIsMobileOutlineOpen(false);
            }}/>
        </Drawer>)}

      <footer className="flex h-[var(--statusbar-h)] shrink-0 items-center gap-2 overflow-hidden border-t border-[var(--border-subtle)] px-3 text-[length:var(--text-11)] text-[var(--text-quaternary)]">
        <span className="tabular">{note.wordCount}{t("common.words")}</span>
        <span className="hidden tabular sm:inline">{note.charCount}{t("workspace.characters")}</span>
        <span className="hidden tabular md:inline">{t("common.about")}{readingMinutes(note.wordCount)}{t("common.min")}</span>
        {noteFolder && noteFolderPath && (<Tooltip label={noteFolderPath} side="top">
            <button type="button" onClick={() => openFolderView(folders, noteFolder.id)} className="inline-flex min-w-0 max-w-40 items-center gap-1 truncate rounded px-1 py-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] md:max-w-48">
              <FolderClosed size={11} className="shrink-0" style={{ color: noteFolder.color ?? undefined }}/>
              <span className="truncate">{noteFolderPath}</span>
            </button>
          </Tooltip>)}
        {note.tags.length > 0 && (<span className="flex min-w-0 items-center gap-0.5 overflow-hidden">
            {note.tags.slice(0, isMobile ? 2 : 4).map((name) => (<button key={name} type="button" onClick={() => useUi.getState().openView('tag', { tag: name })} className="inline-flex min-w-0 items-center gap-0.5 rounded px-1 py-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]">
                <Hash size={9} className="shrink-0" style={{ color: tagColors.get(name) ?? undefined }}/><span className="truncate">{name}</span>
              </button>))}
          </span>)}
        <span className="flex-1"/>
        <span className={cn('hidden', grouped ? '2xl:inline' : 'lg:inline')}>{t("common.created")}{fullTime(note.createdAt)}</span>
      </footer>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (view && files.length) await insertFiles(view, files, handlers);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={async (event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (view && files.length) await insertFiles(view, files, handlers);
        }}
      />
      <AttachmentDriveModal
        open={isAttachmentDriveOpen}
        onClose={() => setIsAttachmentDriveOpen(false)}
        onInsertFile={(file) => {
          if (view) {
            const isImage = file.mime.startsWith('image/');
            const snippet = isImage ? `![${file.filename}](${file.url})` : `\n[${file.filename}](${file.url})\n`;
            const sel = view.state.selection.main;
            view.dispatch({
              changes: { from: sel.from, to: sel.to, insert: snippet },
              selection: { anchor: sel.from + snippet.length },
            });
            view.focus();
          }
          setIsAttachmentDriveOpen(false);
        }}
      />
    </div>);
}
