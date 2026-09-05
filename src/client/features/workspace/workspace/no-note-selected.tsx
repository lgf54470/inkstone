import { Plus } from 'lucide-react';
import { prettyCombo } from '../../../lib/hotkeys';
import { Empty } from '../../../components/feedback';
import { t } from '../../../lib/i18n';

export function NoNoteSelected({ onCreate }: {
    onCreate: () => void;
}) {
    return (<div className="flex h-full items-center justify-center bg-[var(--bg-editor)]">
      <Empty art="select" title={t("workspace.choose_a_note_or_write_a_new_one")} description={t("workspace.open_a_note_from_the_list_or_press_shortcut_to_create_one", { shortcut: prettyCombo('mod+n').join('+') })} action={<button type="button" onClick={onCreate} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-3.5 text-[length:var(--text-12\.5)] font-medium text-[var(--accent-contrast)] transition-transform active:translate-y-px">
            <Plus size={14}/>{t("common.new_note")}</button>}/>
    </div>);
}
