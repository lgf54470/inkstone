import { renderNewNoteTemplate } from '@shared/markdown-utils'
import type { NoteTemplate } from '@shared/types'
import { useNotes } from '../store/notes'
import { useUi } from '../store/ui'
import { t } from './i18n'

/** Creates a note from a template and opens it, returning the new note id (or null on failure). */
export async function createNoteFromTemplate(template: NoteTemplate): Promise<string | null> {
    const rendered = renderNewNoteTemplate(template.content, template.name, new Date());
    const id = await useNotes.getState().createNote({
        title: template.name,
        content: rendered.content,
        open: true,
    });
    if (id)
        useUi.getState().toast({ title: t("templates.created_note_from_template"), tone: 'success' });
    return id;
}
