import { Input } from '../../../components/form';
import { t } from '../../../lib/i18n';

export function CodeInput(props: { value: string; isBusy: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">
        {t('settings.totp_authenticator_code')}
      </span>
      <Input
        value={props.value}
        maxLength={6}
        onChange={(event) => props.onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={props.isBusy}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
      />
    </label>
  )
}

