import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'

export function notifyActionFailed(): void {
  useUi.getState().toast({ title: t('common.action_failed'), tone: 'danger' })
}
