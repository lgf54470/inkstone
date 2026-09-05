import { Button } from '../../../components/primitives';
import { t } from '../../../lib/i18n';

export function ActionRow(props: {
  isBusy: boolean
  onCancel: () => void
  submitLabel: string
  danger?: boolean
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" size="sm" variant="ghost" disabled={props.isBusy} onClick={props.onCancel}>
        {t('common.cancel')}
      </Button>
      <Button
        type="submit"
        size="sm"
        variant={props.danger ? 'danger' : 'primary'}
        loading={props.isBusy}
      >
        {props.submitLabel}
      </Button>
    </div>
  )
}

