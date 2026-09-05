import { buildTemplateLibraryExport } from '@shared/note-templates'
import { useNoteTemplates } from '../../store/note-templates'
import { useUi } from '../../store/ui'
import { t } from '../../lib/i18n'

    export function exportTemplateLibrary(): void {
        const state = useNoteTemplates.getState();
        const data = buildTemplateLibraryExport(state.categories, state.templates);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `inkstone-templates-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        useUi.getState().toast({ title: t("templates.exported_value0_templates", { value0: data.templates.length }), tone: 'success' });
}

    export async function copyTemplateLibraryJson(): Promise<void> {
        const state = useNoteTemplates.getState();
        const data = buildTemplateLibraryExport(state.categories, state.templates);
        const text = JSON.stringify(data, null, 2);
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                useUi.getState().toast({ title: t("templates.copied_to_clipboard"), tone: 'success' });
            } catch {
                useUi.getState().toast({ title: t("templates.copy_failed"), tone: 'danger' });
            }
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        useUi.getState().toast({ title: t("templates.copied_to_clipboard"), tone: 'success' });
}
