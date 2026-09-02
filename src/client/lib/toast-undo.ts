import { t } from './i18n';
import { useUi } from '../store/ui';

export function toastWithUndo(title: string, undo: () => void): void {
    useUi.getState().toast({
        title,
        action: { label: t('common.undo'), run: undo },
    });
}