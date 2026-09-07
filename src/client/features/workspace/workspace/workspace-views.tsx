import { ArrowLeft, Columns2, Download, Eye, FolderClosed, Globe, Hash, History, LinkIcon, ListTree, MoreHorizontal, PanelRightClose, Paperclip, Pencil, Share2, Star, X } from 'lucide-react';
import { readingMinutes } from '@shared/markdown-utils';
import { LIMITS } from '@shared/constants';
import { type EditorLayout } from '@shared/types';
import { cn } from '../../../lib/cn';
import { EditorContextMenu } from '../editor-context-menu';
import { fullTime } from '../../../lib/time';
import { IconButton } from '../../../components/primitives';
import { Drawer, Menu, Tooltip, type MenuItem } from '../../../components/overlay';
import { Segmented, type SegmentedOption } from '../../../components/form';
import { CodeEditor } from '../../../editor/code-editor';
import { insertFiles } from '../../../editor/paste';
import { Outline, Preview } from '../../preview';
import { SplitResizer, SaveIndicator } from '../../shell';
import { EditorToolbar } from '../editor-toolbar';
import { BacklinksPanel } from '../backlinks-panel';
import { AttachmentDriveModal } from '../../attachments';
import { folderPathLabel, openFolderView } from '../../../lib/folders';
import { useUi } from '../../../store/ui';
import { t } from '../../../lib/i18n';
import type { WorkspaceBundle } from './use-workspace';
import type { ExportNote } from './workspace-menus';

function groupedLayoutOptions(): SegmentedOption<EditorLayout>[] {
  return [
    { value: 'edit', label: <Pencil size={12.5} />, title: t('workspace.edit_only') },
    { value: 'split', label: <Columns2 size={12.5} />, title: t('workspace.split_view') },
    { value: 'preview', label: <Eye size={12.5} />, title: t('workspace.preview_only') },
  ];
}

function standaloneLayoutOptions(): SegmentedOption<EditorLayout>[] {
  return [
    { value: 'edit', label: <Pencil size={12.5} />, title: t('workspace.edit_only') },
    { value: 'split', label: <Columns2 size={12.5} />, title: t('workspace.split_view'), combo: 'mod+\\\\' },
    { value: 'preview', label: <Eye size={12.5} />, title: t('workspace.preview_only') },
  ];
}

function TitleArea({ b, grouped }: { b: WorkspaceBundle; grouped: boolean }) {
  const { note, editTitle, view, isShared, isBlogPublished, updatedTime } = b;
  return (
    <div className='flex min-w-0 flex-1 items-center gap-1'>
      <input
        ref={b.titleInputRef}
        type='text'
        value={note.title}
        maxLength={LIMITS.titleMaxLength}
        aria-label={t('workspace.note_title')}
        placeholder={t('common.untitled_note')}
        className='h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[length:var(--text-14)] font-semibold tracking-[-0.01em] text-[var(--text-primary)] outline-none transition-colors placeholder:font-medium placeholder:text-[var(--text-quaternary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] focus:border-[var(--accent)] focus:bg-[var(--bg-surface)]'
        onChange={(event) => editTitle(note.id, event.target.value)}
        onBlur={(event) => editTitle(note.id, event.currentTarget.value.trim())}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (view) view.focus();
          else event.currentTarget.blur();
        }}
      />
      {note.isStarred && <Star size={11} className='shrink-0 fill-current text-[var(--warning)]' />}
      {isShared && (
        <span title={t('workspace.share')} className='inline-flex items-center'>
          <Share2 size={11} className='shrink-0 text-[var(--accent)]' />
        </span>
      )}
      {isBlogPublished && (
        <span title={t('blog.published')} className='inline-flex items-center'>
          <Globe size={11} className='shrink-0 text-[var(--accent)]' />
        </span>
      )}
      {!grouped && (
        <span className='hidden shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)] md:inline'>
          {updatedTime}
        </span>
      )}
    </div>
  );
}

function GroupedHeaderActions({ b }: { b: WorkspaceBundle }) {
  const { layout, setEditorLayout, setIsMoreMenuOpen, pane, closeSecondaryNote, moreButtonRef } = b;
  return (
    <>
      <div className='mr-1 hidden 2xl:block'>
        <Segmented label={t('workspace.layout')} size='sm' value={layout} onChange={setEditorLayout} options={groupedLayoutOptions()} />
      </div>
      <Tooltip label={t('common.more_actions')} side='left'>
        <IconButton ref={moreButtonRef} label={t('common.more_actions')} size='sm' onClick={() => setIsMoreMenuOpen(true)}>
          <MoreHorizontal size={16} />
        </IconButton>
      </Tooltip>
      {pane === 'secondary' && (
        <Tooltip label={t('workspace.close_right_note')} side='left'>
          <IconButton label={t('workspace.close_right_note')} size='sm' onClick={closeSecondaryNote}>
            <X size={15} />
          </IconButton>
        </Tooltip>
      )}
    </>
  );
}

function StandaloneHeaderActions({ b, exportMenuItems }: { b: WorkspaceBundle; exportMenuItems: MenuItem[] }) {
  const { note, patchNote, isAttachmentDriveOpen, setIsAttachmentDriveOpen, backlinksOpen, toggleBacklinks, isMobile, openPanel, exportMenuRef, isExportMenuOpen, setIsExportMenuOpen, showPreview, outlineOpen, isMobileOutlineOpen, setIsMobileOutlineOpen, toggleOutline, moreButtonRef, setIsMoreMenuOpen } = b;
  return (
    <>
      <span className='mr-1 hidden xl:inline-flex'><SaveIndicator /></span>
      <div className='mr-1 hidden lg:block'><Segmented label={t('workspace.layout')} size='sm' value={b.layout} onChange={b.setEditorLayout} options={standaloneLayoutOptions()} /></div>
      <Tooltip label={note.isStarred ? t('common.remove_from_favorites') : t('navigation.favorites')} combo='mod+d'><IconButton label={note.isStarred ? t('common.remove_from_favorites') : t('navigation.favorites')} size='sm' active={note.isStarred} onClick={() => void patchNote(note.id, { isStarred: !note.isStarred })}><Star size={14} className={note.isStarred ? 'fill-current' : undefined} /></IconButton></Tooltip>
      <Tooltip label={t('attachments.manage')}><IconButton label={t('attachments.manage')} size='sm' active={isAttachmentDriveOpen} onClick={() => setIsAttachmentDriveOpen(true)}><Paperclip size={14} /></IconButton></Tooltip>
      <Tooltip label={t('common.backlinks')}><IconButton label={t('common.backlinks')} size='sm' active={backlinksOpen} onClick={toggleBacklinks}><LinkIcon size={14} /></IconButton></Tooltip>
      {!isMobile && <Tooltip label={t('common.version_history')}><IconButton label={t('common.version_history')} size='sm' onClick={() => openPanel('versions')}><History size={14} /></IconButton></Tooltip>}
      {!isMobile && (
        <>
          <Tooltip label={t('workspace.export')}><IconButton ref={exportMenuRef} label={t('workspace.export')} size='sm' onClick={() => setIsExportMenuOpen(true)}><Download size={14} /></IconButton></Tooltip>
          <Menu anchor={exportMenuRef} open={isExportMenuOpen} onClose={() => setIsExportMenuOpen(false)} items={exportMenuItems} align='end' width={200} />
        </>
      )}
      {showPreview && <Tooltip label={t('common.outline')} combo='mod+shift+o'><IconButton label={t('common.outline')} size='sm' active={isMobile ? isMobileOutlineOpen : outlineOpen} onClick={() => (isMobile ? setIsMobileOutlineOpen((open) => !open) : toggleOutline())}>{(isMobile ? isMobileOutlineOpen : outlineOpen) ? <PanelRightClose size={14} /> : <ListTree size={14} />}</IconButton></Tooltip>}
      {!isMobile && <Tooltip label={t('workspace.share')}><IconButton label={t('workspace.share')} size='sm' onClick={() => openPanel('share')}><Share2 size={14} /></IconButton></Tooltip>}
      {isMobile && <Tooltip label={t('common.more_actions')} side='left'><IconButton ref={moreButtonRef} label={t('common.more_actions')} size='sm' onClick={() => setIsMoreMenuOpen(true)}><MoreHorizontal size={16} /></IconButton></Tooltip>}
    </>
  );
}

export function WorkspaceHeader({ b, grouped, onMobileBack, exportMenuItems }: { b: WorkspaceBundle; grouped: boolean; onMobileBack?: () => void; exportMenuItems: MenuItem[] }) {
  const { isMobile } = b;
  return (
    <header className='flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3'>
      {isMobile && onMobileBack && (
        <Tooltip label={t('workspace.back_to_notes')} side='right'>
          <IconButton label={t('workspace.back_to_notes')} size='sm' onClick={onMobileBack}>
            <ArrowLeft size={16} />
          </IconButton>
        </Tooltip>
      )}
      <TitleArea b={b} grouped={grouped} />
      <div className='flex shrink-0 items-center gap-0.5'>
        {grouped ? <GroupedHeaderActions b={b} /> : <StandaloneHeaderActions b={b} exportMenuItems={exportMenuItems} />}
      </div>
    </header>
  );
}

export function WorkspacePanes({ b }: { b: WorkspaceBundle }) {
  const { showEditor, layout, editorWidth, note, content, onChange, editorSettings, sources, handlers, setView, handleEditorContextMenu, showPreview, previewWidth, previewScrollerRef, setHeadings, invalidateSyncAnchors, handlePreviewContextMenu, outlineVisible, headings, jumpToHeading, effectiveSplitRatio, containerRef, setLayout } = b;
  return (
    <>
      {showEditor && (
        <div className='min-w-0' style={{ width: layout === 'split' ? editorWidth : '100%' }}>
          <CodeEditor key={note.id} value={content} onChange={onChange} settings={editorSettings} sources={sources} handlers={handlers} noteId={note.id} onReady={setView} onContextMenu={handleEditorContextMenu} />
        </div>
      )}
      {layout === 'split' && (
        <SplitResizer label={t('workspace.resize_editor_and_preview_panes')} containerRef={containerRef} ratio={effectiveSplitRatio} onChange={(splitRatio) => setLayout({ splitRatio })} onReset={() => setLayout({ splitRatio: null })} />
      )}
      {showPreview && (
        <div className={cn('flex min-w-0 overflow-hidden border-l border-[var(--border-subtle)] bg-[var(--bg-editor)]', layout === 'preview' && 'flex-1 border-l-0')} style={{ width: layout === 'split' ? previewWidth : undefined }}>
          <Preview key={note.id} content={content} noteId={note.id} noteTitle={note.title} onHeadings={setHeadings} scrollerRef={previewScrollerRef} onRendered={invalidateSyncAnchors} onContextMenu={handlePreviewContextMenu} className='min-w-0 flex-1' />
          {outlineVisible && <Outline headings={headings} onSelect={jumpToHeading} scrollerRef={previewScrollerRef} />}
        </div>
      )}
    </>
  );
}

export function WorkspaceOverlays({ b, grouped, exportNote, groupedItems, mobileItems }: { b: WorkspaceBundle; grouped: boolean; exportNote: ExportNote; groupedItems: MenuItem[]; mobileItems: MenuItem[] }) {
  const { contextMenuPoint, closeContextMenu, view, editorContextData, previewContextData, content, note, onChange, handleJumpToLine, imageInputRef, fileInputRef, setEditorLayout, layout, previewScrollerRef, moreButtonRef, isMoreMenuOpen, setIsMoreMenuOpen, isMobile, showPreview, isMobileOutlineOpen, setIsMobileOutlineOpen, headings, jumpToHeading } = b;
  return (
    <>
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
      <Menu anchor={moreButtonRef} open={isMoreMenuOpen} onClose={() => setIsMoreMenuOpen(false)} items={grouped ? groupedItems : mobileItems} align='end' width={220} />
      {isMobile && showPreview && (
        <Drawer open={isMobileOutlineOpen} onClose={() => setIsMobileOutlineOpen(false)} side='right' width={320} title={t('common.outline')}>
          <Outline
            headings={headings}
            scrollerRef={previewScrollerRef}
            className='max-h-none w-full self-stretch py-3'
            onSelect={(heading) => {
              jumpToHeading(heading);
              setIsMobileOutlineOpen(false);
            }}
          />
        </Drawer>
      )}
    </>
  );
}

export function WorkspaceFooter({ b, grouped }: { b: WorkspaceBundle; grouped: boolean }) {
  const { note, folders, tagColors, isMobile } = b;
  const noteFolder = note.folderId ? folders.find((folder) => folder.id === note.folderId) ?? null : null;
  const noteFolderPath = note.folderId ? folderPathLabel(folders, note.folderId) : '';
  return (
    <footer className='flex h-[var(--statusbar-h)] shrink-0 items-center gap-2 overflow-hidden border-t border-[var(--border-subtle)] px-3 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
      <span className='tabular'>{note.wordCount}{t('common.words')}</span>
      <span className='hidden tabular sm:inline'>{note.charCount}{t('workspace.characters')}</span>
      <span className='hidden tabular md:inline'>{t('common.about')}{readingMinutes(note.wordCount)}{t('common.min')}</span>
      {noteFolder && noteFolderPath && (
        <Tooltip label={noteFolderPath} side='top'>
          <button
            type='button'
            onClick={() => openFolderView(folders, noteFolder.id)}
            className='inline-flex min-w-0 max-w-40 items-center gap-1 truncate rounded px-1 py-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] md:max-w-48'
          >
            <FolderClosed size={11} className='shrink-0' style={{ color: noteFolder.color ?? undefined }} />
            <span className='truncate'>{noteFolderPath}</span>
          </button>
        </Tooltip>
      )}
      {note.tags.length > 0 && (
        <span className='flex min-w-0 items-center gap-0.5 overflow-hidden'>
          {note.tags.slice(0, isMobile ? 2 : 4).map((name) => (
            <button
              key={name}
              type='button'
              onClick={() => useUi.getState().openView('tag', { tag: name })}
              className='inline-flex min-w-0 items-center gap-0.5 rounded px-1 py-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]'
            >
              <Hash size={9} className='shrink-0' style={{ color: tagColors.get(name) ?? undefined }} />
              <span className='truncate'>{name}</span>
            </button>
          ))}
        </span>
      )}
      <span className='flex-1' />
      <span className={cn('hidden', grouped ? '2xl:inline' : 'lg:inline')}>{t('common.created')}{fullTime(note.createdAt)}</span>
    </footer>
  );
}

export function FileInputs({ b }: { b: WorkspaceBundle }) {
  const { imageInputRef, fileInputRef, view, handlers } = b;
  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (view && files.length) await insertFiles(view, files, handlers);
  };
  return (
    <>
      <input ref={imageInputRef} type='file' accept='image/*' multiple hidden onChange={onChange} />
      <input ref={fileInputRef} type='file' multiple hidden onChange={onChange} />
    </>
  );
}

export function WorkspaceToolbar({ b }: { b: WorkspaceBundle }) {
  return b.editorSettings.showToolbar && b.showEditor ? (
    <EditorToolbar
      runCommand={b.runEditorCommand}
      mobile={b.isMobile}
      onPickImage={() => b.imageInputRef.current?.click()}
      onPickFile={() => b.fileInputRef.current?.click()}
    />
  ) : null;
}

export function BacklinksSection({ b }: { b: WorkspaceBundle }) {
  return b.backlinksOpen && b.paneActive ? <BacklinksPanel noteId={b.note.id} /> : null;
}

export function AttachmentDrive({ b }: { b: WorkspaceBundle }) {
  const { isAttachmentDriveOpen, setIsAttachmentDriveOpen, view } = b;
  return (
    <AttachmentDriveModal
      open={isAttachmentDriveOpen}
      onClose={() => setIsAttachmentDriveOpen(false)}
      onInsertFile={(file) => {
        if (!view) {
          setIsAttachmentDriveOpen(false);
          return;
        }
        const isImage = file.mime.startsWith('image/');
        const snippet = isImage ? `![${file.filename}](${file.url})` : `\n[${file.filename}](${file.url})\n`;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: snippet },
          selection: { anchor: sel.from + snippet.length },
        });
        view.focus();
        setIsAttachmentDriveOpen(false);
      }}
    />
  );
}