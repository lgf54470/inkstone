import { LIMITS } from '@shared/constants';
import { Input } from '../../../components/form';
import { t } from '../../../lib/i18n';

export function PasswordInput(props: {
  value: string
  isBusy: boolean
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">
        {t('settings.current_password')}
      </span>
      <Input
        type="password"
        value={props.value}
        maxLength={LIMITS.passwordMaxLength}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.isBusy}
        autoComplete="current-password"
        autoFocus={props.autoFocus}
      />
    </label>
  )
}

