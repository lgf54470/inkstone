import { FileCode, FileDown, FileText, Globe, History, LayoutGrid, LinkIcon, ListTree, Music, Share2, Star } from 'lucide-react'
import type { MenuItem } from '../../../components/overlay'
import type { PanelName, WorkspacePane } from '../../../store/ui'
import type { WorkspaceBundle } from './use-workspace'
import { t } from '../../../lib/i18n'

export type ExportNote = (format: 'md' | 'html' | 'pdf') => void

export function buildExportMenuItems(exportNote: ExportNote): MenuItem[] {
  return [
    { id: 'md', label: t('workspace.export_markdown'), icon: <FileText size={13} />, onSelect: () => void exportNote('md') },
    { id: 'html', label: t('workspace.export_html'), icon: <FileCode size={13} />, onSelect: () => void exportNote('html') },
    { id: 'pdf', label: t('workspace.export_pdf'), icon: <FileDown size={13} />, onSelect: () => void exportNote('pdf') },
  ]
}

export function buildMobileItems(openPanel: (panel: PanelName) => void, exportNote: ExportNote): MenuItem[] {
  return [
    { id: 'versions', label: t('common.version_history'), icon: <History size={13} />, onSelect: () => openPanel('versions') },
    { id: 'share', label: t('workspace.share'), icon: <Share2 size={13} />, onSelect: () => openPanel('share') },
    { id: 'share-hub', label: t('share.manage_shares'), icon: <LayoutGrid size={13} />, onSelect: () => openPanel('share-hub') },
    { id: 'blog-publish', label: t('blog.publish_to_blog'), icon: <Globe size={13} />, onSelect: () => openPanel('blog-publish') },
    { id: 'blog-hub', label: t('blog.blog_hub'), icon: <Globe size={13} />, onSelect: () => openPanel('blog-hub') },
    { id: 'music-hub', label: t('music.hub_title'), icon: <Music size={13} />, onSelect: () => openPanel('music-hub') },
    { id: 'export-md', label: t('workspace.export_markdown'), icon: <FileText size={13} />, onSelect: () => void exportNote('md') },
    { id: 'export-html', label: t('workspace.export_html'), icon: <FileCode size={13} />, onSelect: () => void exportNote('html') },
    { id: 'export-pdf', label: t('workspace.export_pdf'), icon: <FileDown size={13} />, onSelect: () => void exportNote('pdf') },
  ]
}

export function buildGroupedItems(b: WorkspaceBundle, exportNote: ExportNote): MenuItem[] {
  const { note, layout, setEditorLayout, patchNote, backlinksOpen, paneActive, toggleBacklinks, showPreview, outlineOpen, toggleOutline, openPanel } = b
  return [
    { id: 'layout-edit', label: t('workspace.edit_only'), checked: layout === 'edit', onSelect: () => setEditorLayout('edit') },
    { id: 'layout-split', label: t('workspace.split_view'), checked: layout === 'split', onSelect: () => setEditorLayout('split') },
    { id: 'layout-preview', label: t('workspace.preview_only'), checked: layout === 'preview', onSelect: () => setEditorLayout('preview') },
    {
      id: 'star',
      label: note.isStarred ? t('common.remove_from_favorites') : t('navigation.favorites'),
      icon: <Star size={13} />,
      separatorBefore: true,
      onSelect: () => void patchNote(note.id, { isStarred: !note.isStarred }),
    },
    {
      id: 'backlinks',
      label: t('common.backlinks'),
      icon: <LinkIcon size={13} />,
      checked: backlinksOpen && paneActive,
      onSelect: toggleBacklinks,
    },
    ...(showPreview
      ? [
          {
            id: 'outline',
            label: t('common.outline'),
            icon: <ListTree size={13} />,
            checked: outlineOpen && paneActive,
            onSelect: toggleOutline,
          } satisfies MenuItem,
        ]
      : []),
    ...buildMobileItems(openPanel, exportNote),
  ]
}

export function activateWorkspacePane(pane: WorkspacePane | 'active', grouped: boolean, paneActive: boolean, activatePane: (pane: WorkspacePane) => void) {
  if (grouped && pane !== 'active' && !paneActive) activatePane(pane)
}