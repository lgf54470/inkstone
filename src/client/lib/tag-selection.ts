import { t } from './i18n';
import { useUi } from '../store/ui';

/** Clears the multi-tag selection shared by the sidebar, list/palette filters, and graph; optionally confirms with a toast (a string overrides the default message). */
export function clearTagSelection(options?: { notify?: boolean | string }): void {
    useUi.getState().clearTagSelection();
    if (options?.notify)
        useUi.getState().toast({ title: typeof options.notify === 'string' ? options.notify : t('sidebar.tags_cleared') });
}

export type GraphClearToastKey = 'graph.tags_cleared_reset' | 'graph.tags_cleared_reset_panel_stays' | 'graph.tags_cleared_panel_stays';

/** The toast key for a graph clear, or null for the default message, based on the clear-behavior preferences. */
export function clearSelectionToastKey(clearResetsTag: boolean, clearClosesPanel: boolean): GraphClearToastKey | null {
    if (clearResetsTag && clearClosesPanel)
        return 'graph.tags_cleared_reset';
    if (clearResetsTag)
        return 'graph.tags_cleared_reset_panel_stays';
    if (!clearClosesPanel)
        return 'graph.tags_cleared_panel_stays';
    return null;
}