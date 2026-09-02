import { downloadZip } from 'client-zip';
import type { NoteSummary } from '@shared/types';
import { folderDescendantIds, folderPath } from './folders';
import { useNotes } from '../store/notes';

export function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export interface ExportFolderResult {
  count: number;
  filename: string;
}

export async function exportFolderAsZip(folderId: string): Promise<ExportFolderResult> {
  const state = useNotes.getState();
  const folders = state.folders ?? [];
  const rootFolder = folders.find((f) => f.id === folderId);
  if (!rootFolder) {
    throw new Error('Folder not found');
  }

  const descendantIds = folderDescendantIds(folders, folderId);
  const allNotes = Object.values(state.notes).filter(
    (n): n is NoteSummary =>
      Boolean(n && n.deletedAt === null && !n.isArchived && n.folderId && descendantIds.has(n.folderId))
  );

  const zipFilename = `${safeFileName(rootFolder.name) || 'folder'}-export.zip`;

  if (allNotes.length === 0) {
    return { count: 0, filename: zipFilename };
  }

  // Pre-calculate relative path from root for every folder in the tree
  const folderRelativePaths = new Map<string, string>();
  const rootAncestorsCount = folderPath(folders, folderId).length;

  for (const fId of descendantIds) {
    const p = folderPath(folders, fId);
    const relSegments = p.slice(rootAncestorsCount - 1).map((f) => safeFileName(f.name) || 'folder');
    folderRelativePaths.set(fId, relSegments.join('/'));
  }

  // Group notes by relative directory to avoid file collisions
  const files: Array<{ name: string; lastModified: Date; input: Response | string }> = [];
  const dirFilesCount = new Map<string, Map<string, number>>();

  for (const note of allNotes) {
    const relDir = (note.folderId && folderRelativePaths.get(note.folderId)) || safeFileName(rootFolder.name) || 'folder';
    let seenInDir = dirFilesCount.get(relDir);
    if (!seenInDir) {
      seenInDir = new Map<string, number>();
      dirFilesCount.set(relDir, seenInDir);
    }

    const baseName = safeFileName(note.title) || 'note';
    const occurrences = seenInDir.get(baseName) ?? 0;
    seenInDir.set(baseName, occurrences + 1);
    const finalFileName = occurrences === 0 ? `${baseName}.md` : `${baseName} (${occurrences}).md`;
    const fullPath = `${relDir}/${finalFileName}`;

    let content = state.contents[note.id];
    if (content === undefined) {
      content = (await state.peekContent(note.id)) ?? '';
    }

    const title = note.title.trim();
    const frontMatter = title ? `---\ntitle: ${JSON.stringify(title)}\n---\n\n` : '';

    files.push({
      name: fullPath,
      lastModified: new Date(note.updatedAt || Date.now()),
      input: new Response(`${frontMatter}${content}`),
    });
  }

  const zipResponse = downloadZip(files);
  const blob = await zipResponse.blob();

  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = zipFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { count: allNotes.length, filename: zipFilename };
}
