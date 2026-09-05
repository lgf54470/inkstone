import { useRef, useState } from 'react'
import { confirm } from '../../../components/overlay'
import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
import { useNotes } from '../../../store/notes'
import { useUi } from '../../../store/ui'

export function useEmptyTrash() {
    const emptyTrashAction = useNotes((s) => s.emptyTrash);
    const toast = useUi((s) => s.toast);
    const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
    const busyRef = useRef(false);
    const emptyTrash = async () => {
        if (busyRef.current)
            return;
        busyRef.current = true;
        setIsEmptyingTrash(true);
        try {
            const ok = await confirm({
                title: t("common.empty_trash"),
                description: t("notes.every_note_inside_will_be_permanently_deleted_and_cannot_be_recovered"),
                confirmLabel: t("common.clear"),
                tone: 'danger',
            });
            if (!ok)
                return;
            const purged = await emptyTrashAction();
            if (purged === null)
                return;
            toast({
                title: t("common.permanently_deleted_value0_notes", { value0: purged }),
                tone: 'success',
            });
        }
        catch (err) {
            toast({ title: t("notes.clearing_failed"), description: errorMessage(err), tone: 'danger' });
        }
        finally {
            busyRef.current = false;
            setIsEmptyingTrash(false);
        }
    };
    return { emptyTrash, isEmptyingTrash };
}
