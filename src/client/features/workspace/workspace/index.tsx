import { cn } from '../../../lib/cn';
import { EditorSkeleton } from '../../../components/feedback';
import { createContextualNote } from '../../../store/notes/selectors';
import { t } from '../../../lib/i18n';
import type { WorkspacePane } from '../../../store/ui';
import { NoNoteSelected } from './no-note-selected';
import { useWorkspace, type WorkspaceBundle } from './use-workspace';
import { buildExportMenuItems, buildMobileItems, buildGroupedItems, activateWorkspacePane } from './workspace-menus';
import { WorkspaceHeader, WorkspacePanes, WorkspaceOverlays, WorkspaceFooter, FileInputs, WorkspaceToolbar, BacklinksSection, AttachmentDrive } from './workspace-views';

export function Workspace({ mobileLayout = 'edit', onMobileBack, pane = 'active', grouped = false }: {
    mobileLayout?: 'edit' | 'preview';
    onMobileBack?: () => void;
    pane?: WorkspacePane | 'active';
    grouped?: boolean;
} = {}) {
  const raw = useWorkspace(pane, mobileLayout, grouped);
  if (!raw.note) return <NoNoteSelected onCreate={() => void createContextualNote()} />;
  if (!raw.loaded) {
    return (
      <div className="h-full overflow-hidden bg-[var(--bg-editor)]" aria-busy="true" aria-label={t('workspace.loading_note_content')}>
        <EditorSkeleton />
      </div>
    );
  }
  const b: WorkspaceBundle = { ...raw, note: raw.note };
  const exportMenuItems = buildExportMenuItems(b.exportNote);
  const mobileItems = buildMobileItems(b.openPanel, b.exportNote);
  const groupedItems = buildGroupedItems(b, b.exportNote);
  return (
    <div
      role={grouped ? 'region' : undefined}
      aria-label={grouped ? (pane === 'secondary' ? t('workspace.right_note_pane') : t('workspace.left_note_pane')) : undefined}
      data-workspace-pane={grouped ? pane : undefined}
      onPointerDownCapture={() => activateWorkspacePane(pane, grouped, b.paneActive, b.activateWorkspacePane)}
      onFocusCapture={() => activateWorkspacePane(pane, grouped, b.paneActive, b.activateWorkspacePane)}
      className={cn('flex h-full min-h-0 flex-col bg-[var(--bg-editor)]', grouped && b.paneActive && 'shadow-[inset_0_2px_0_var(--accent)]')}
    >
      <WorkspaceHeader b={b} grouped={grouped} onMobileBack={onMobileBack} exportMenuItems={exportMenuItems} />
      <WorkspaceToolbar b={b} />
      <div ref={b.containerRef} className="flex min-h-0 flex-1">
        <WorkspacePanes b={b} />
      </div>
      <BacklinksSection b={b} />
      <WorkspaceOverlays b={b} grouped={grouped} exportNote={b.exportNote} groupedItems={groupedItems} mobileItems={mobileItems} />
      <WorkspaceFooter b={b} grouped={grouped} />
      <FileInputs b={b} />
      <AttachmentDrive b={b} />
    </div>
  );
}