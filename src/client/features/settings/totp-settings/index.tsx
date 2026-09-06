import { Check, Copy, Download, KeyRound, QrCode, RefreshCw, ShieldCheck, ShieldOff, TriangleAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { type TotpSetupInfo, type TotpStatus } from '@shared/types';
import { Badge, Button } from '../../../components/primitives';
import { Input, SettingRow } from '../../../components/form';
import { t } from '../../../lib/i18n';
import { PasswordInput } from './password-input';
import { CodeInput } from './code-input';
import { ActionRow } from './action-row';
import { InlineError } from './inline-error';
import { useTotpSettings, type TotpPanel, type TotpSettingsState } from './use-totp-settings';

const QR_BG_COLOR = '#ffffff'
const QR_FG_COLOR = '#111827'

export function TotpSettings() {
  const s = useTotpSettings()
  if (s.isLoading && !s.status) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-4 text-[length:var(--text-12)] text-[var(--text-tertiary)]">
        {t('settings.totp_loading')}
      </div>
    )
  }
  if (!s.status) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
        <p role="alert" className="text-[length:var(--text-12)] text-[var(--danger)]">
          {s.error ?? t('settings.totp_load_failed')}
        </p>
        <Button className="mt-3" size="sm" icon={<RefreshCw size={12} />} onClick={() => void s.load()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <StatusHeader status={s.status} panel={s.panel} onManage={() => s.resetForm('regenerate')} onEnable={() => s.resetForm('enable')} />
      {s.panel === 'enable' && <EnablePanel s={s} />}
      {s.panel === 'setup' && s.setup && <SetupPanel s={s} setup={s.setup} />}
      {s.panel === 'recovery' && s.recoveryCodes.length > 0 && <RecoveryPanel s={s} codes={s.recoveryCodes} />}
      {s.panel === 'regenerate' && <RegeneratePanel s={s} />}
      {s.panel === 'disable' && <DisablePanel s={s} />}
    </div>
  )
}

function StatusHeader({ status, panel, onManage, onEnable }: {
  status: TotpStatus;
  panel: TotpPanel;
  onManage: () => void;
  onEnable: () => void;
}) {
  const description = status.enabled
    ? t('settings.totp_enabled_description', { count: status.recoveryCodesRemaining })
    : status.available
      ? t('settings.totp_disabled_description')
      : t('settings.totp_unavailable_description')
  return (
    <SettingRow
      className="px-4"
      title={t('settings.totp_title')}
      description={description}
    >
      <div className="flex items-center gap-2">
        <Badge tone={status.enabled ? 'accent' : 'neutral'}>
          {status.enabled ? t('common.on') : t('common.off')}
        </Badge>
        {panel === 'none' && (
          status.enabled ? (
            <Button size="sm" variant="secondary" icon={<KeyRound size={12} />} onClick={onManage}>
              {t('settings.totp_manage')}
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={<ShieldCheck size={12} />} disabled={!status.available} onClick={onEnable}>
              {t('settings.totp_enable')}
            </Button>
          )
        )}
      </div>
    </SettingRow>
  )
}

function PanelForm({ onSubmit, children }: {
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <form className="space-y-3 border-t border-[var(--border-subtle)] px-4 py-4" onSubmit={(event) => {
      event.preventDefault()
      onSubmit()
    }}>
      {children}
    </form>
  )
}

function EnablePanel({ s }: { s: TotpSettingsState }) {
  return (
    <PanelForm onSubmit={s.beginSetup}>
      <p className="text-[length:var(--text-12)] leading-relaxed text-[var(--text-tertiary)]">
        {t('settings.totp_enable_password_description')}
      </p>
      <PasswordInput value={s.password} isBusy={s.isBusy} onChange={s.setPassword} autoFocus />
      <InlineError error={s.error} />
      <ActionRow isBusy={s.isBusy} onCancel={() => s.resetForm()} submitLabel={t('common.continue')} />
    </PanelForm>
  )
}

function SetupPanel({ s, setup }: { s: TotpSettingsState; setup: TotpSetupInfo }) {
  return (
    <form className="space-y-4 border-t border-[var(--border-subtle)] px-4 py-4" onSubmit={(event) => {
      event.preventDefault()
      s.confirmSetup()
    }}>
      <div className="grid gap-4 md:grid-cols-[210px_minmax(0,1fr)] md:items-start">
        <QrTile uri={setup.uri} />
        <div className="min-w-0 space-y-3">
          <div>
            <div className="flex items-center gap-2 text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]">
              <QrCode size={15} className="text-[var(--accent)]" />
              {t('settings.totp_scan_qr')}
            </div>
            <p className="mt-1 text-[length:var(--text-12)] leading-relaxed text-[var(--text-tertiary)]">
              {t('settings.totp_scan_qr_description')}
            </p>
          </div>
          <ManualSecretCard secret={setup.secret} onCopy={() => void s.copy(setup.secret, t('settings.totp_secret_copied'))} />
          <ConfirmCodeField value={s.code} disabled={s.isBusy} onChange={s.setCode} />
        </div>
      </div>
      <InlineError error={s.error} />
      <ActionRow isBusy={s.isBusy} onCancel={s.cancelSetup} submitLabel={t('settings.totp_confirm_enable')} />
    </form>
  )
}

function QrTile({ uri }: { uri: string }) {
  return (
    <div className="mx-auto rounded-[var(--r-xl)] border border-[var(--border-default)] bg-white p-2 shadow-[var(--shadow-soft)]">
      <QRCodeSVG
        value={uri}
        size={190}
        level="M"
        marginSize={1}
        bgColor={QR_BG_COLOR}
        fgColor={QR_FG_COLOR}
        title={t('settings.totp_qr_code_title')}
      />
    </div>
  )
}

function ManualSecretCard({ secret, onCopy }: { secret: string; onCopy: () => void }) {
  return (
    <div className="rounded-[var(--r-md)] bg-[var(--bg-surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]">
          {t('settings.totp_manual_secret')}
        </span>
        <Button type="button" size="sm" variant="ghost" icon={<Copy size={11} />} onClick={onCopy}>
          {t('common.copy')}
        </Button>
      </div>
      <code className="mt-1.5 block break-all font-mono text-[length:var(--text-12)] tracking-[0.08em] text-[var(--text-primary)]">
        {secret.match(/.{1,4}/g)?.join(' ')}
      </code>
    </div>
  )
}

function ConfirmCodeField({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (next: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">
        {t('settings.totp_confirm_code')}
      </span>
      <Input
        value={value}
        maxLength={6}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        autoFocus
      />
    </label>
  )
}

function RecoveryPanel({ s, codes }: { s: TotpSettingsState; codes: string[] }) {
  return (
    <div className="space-y-4 border-t border-[var(--border-subtle)] px-4 py-4">
      <RecoveryWarning />
      <RecoveryCodesGrid codes={codes} />
      <InlineError error={s.error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<Copy size={12} />}
          onClick={() => void s.copy(codes.join('\n'), t('settings.totp_recovery_codes_copied'))}
        >
          {t('settings.totp_copy_all')}
        </Button>
        <Button size="sm" variant="secondary" icon={<Download size={12} />} onClick={s.downloadRecoveryCodes}>
          {t('common.download')}
        </Button>
        <Button size="sm" variant="primary" icon={<Check size={12} />} onClick={() => s.resetForm()}>
          {t('settings.totp_saved_codes')}
        </Button>
      </div>
    </div>
  )
}

function RecoveryWarning() {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--warning)_8%,transparent)] p-3">
      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[var(--warning)]" />
      <div>
        <p className="text-[length:var(--text-12\.5)] font-semibold text-[var(--text-primary)]">
          {t('settings.totp_save_recovery_codes')}
        </p>
        <p className="mt-1 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">
          {t('settings.totp_recovery_codes_once')}
        </p>
      </div>
    </div>
  )
}

function RecoveryCodesGrid({ codes }: { codes: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {codes.map((recoveryCode, index) => (
        <code
          key={recoveryCode}
          className="select-all rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-center font-mono text-[length:var(--text-12)] tracking-[0.04em] text-[var(--text-primary)]"
        >
          <span className="mr-2 text-[var(--text-quaternary)]">{index + 1}.</span>
          {recoveryCode}
        </code>
      ))}
    </div>
  )
}

function RegeneratePanel({ s }: { s: TotpSettingsState }) {
  return (
    <PanelForm onSubmit={s.regenerate}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[length:var(--text-12\.5)] font-semibold text-[var(--text-primary)]">
            {t('settings.totp_recovery_codes')}
          </p>
          <p className="mt-1 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">
            {t('settings.totp_regenerate_description')}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="danger"
          icon={<ShieldOff size={12} />}
          disabled={s.isBusy}
          onClick={() => s.resetForm('disable')}
        >
          {t('settings.totp_disable')}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <PasswordInput value={s.password} isBusy={s.isBusy} onChange={s.setPassword} autoFocus />
        <CodeInput value={s.code} isBusy={s.isBusy} onChange={s.setCode} />
      </div>
      <InlineError error={s.error} />
      <ActionRow isBusy={s.isBusy} onCancel={() => s.resetForm()} submitLabel={t('settings.totp_generate_new_codes')} />
    </PanelForm>
  )
}

function DisablePanel({ s }: { s: TotpSettingsState }) {
  return (
    <PanelForm onSubmit={s.disable}>
      <div className="flex items-start gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] p-3">
        <ShieldOff size={15} className="mt-0.5 shrink-0 text-[var(--danger)]" />
        <div>
          <p className="text-[length:var(--text-12\.5)] font-semibold text-[var(--text-primary)]">
            {t('settings.totp_disable_title')}
          </p>
          <p className="mt-1 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">
            {t('settings.totp_disable_description')}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <PasswordInput value={s.password} isBusy={s.isBusy} onChange={s.setPassword} autoFocus />
        <label className="block">
          <span className="mb-1 block text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">
            {t('settings.totp_code_or_recovery')}
          </span>
          <Input
            value={s.code}
            maxLength={24}
            onChange={(event) => s.setCode(event.target.value.toUpperCase())}
            disabled={s.isBusy}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={t('settings.totp_code_or_recovery_placeholder')}
          />
        </label>
      </div>
      <InlineError error={s.error} />
      <ActionRow
        isBusy={s.isBusy}
        onCancel={() => s.resetForm('regenerate')}
        submitLabel={t('settings.totp_confirm_disable')}
        danger
      />
    </PanelForm>
  )
}
