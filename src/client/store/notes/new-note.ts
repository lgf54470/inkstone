/** Fresh-note construction: template expansion, front-matter title sync, and caret memory. */
import { mergeTagsIntoFrontMatter, parseFrontMatter, renderNewNoteTemplate } from '@shared/markdown-utils';
import { isVirtualFolderId } from '../../lib/calendar-tree';
import { t } from '../../lib/i18n';
import { useSession } from '../session';
import { useUi } from '../ui';
import type { Folder } from '@shared/types';

/**
 * Build the initial content of a fresh note from the user-configured template
 * (see settings.notes.newNoteTemplate), merging any tags passed from a tag
 * view into the front matter `tags` list. `{{cursor}}` is resolved by
 * renderNewNoteTemplate so the editor can place the caret there. An empty or
 * whitespace-only template yields a blank note, matching the pre-template
 * behavior.
 */
export function buildNewNoteContent(title: string, tags: string[] = [], folderId: string | null = null, folders: Folder[] = []): { content: string; cursor: number | null } {
    const template = useSession.getState().settings.notes.newNoteTemplate;
    const tagList = tags.map((item) => item.trim().replace(/^#/, '')).filter(Boolean);
    if (!template.trim())
        return { content: '', cursor: null };
    const extra: Record<string, string> = {};
    const folder = folderId ? folders.find((item) => item.id === folderId) : null;
    if (folder?.name)
        extra.folder = folder.name;
    if (tagList.length)
        extra.tags = tagList.join(', ');
    // Interpolate placeholders before the tag merge: the YAML round-trip in
    // mergeTagsIntoFrontMatter would mangle raw `{{...}}` tokens (they parse
    // as flow mappings) and leave them unreplaced in the final note.
    const rendered = renderNewNoteTemplate(template, title || t("common.new_note"), new Date(), extra);
    return mergeTagsIntoFrontMatter(rendered.content, tagList, rendered.cursor);
}
/** Pending caret positions for freshly created notes, consumed by the editor on mount. */
export const pendingEditorCursors = new Map<string, number>()
export function takePendingEditorCursor(noteId: string): number | null {
    const cursor = pendingEditorCursors.get(noteId)
    pendingEditorCursors.delete(noteId)
    return cursor ?? null
}
export function frontMatterTitleOf(content: string): string | undefined {
    const title = parseFrontMatter(content).data.title;
    return typeof title === 'string' ? title : undefined;
}
export function currentFolderId(): string | null {
    const ui = useUi.getState();
    return ui.view === 'folder' && !isVirtualFolderId(ui.folderId) ? ui.folderId : null;
}
