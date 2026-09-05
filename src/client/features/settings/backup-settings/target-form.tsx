import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { type BackupTarget, type BackupTargetInput, type BackupTargetType, type TestConnectionResult } from '@shared/types';
import { cn } from '../../../lib/cn';
import { api, ApiError } from '../../../lib/api';
import { Button } from '../../../components/primitives';
import { Checkbox, Field, Input, Segmented } from '../../../components/form';
import { Modal } from '../../../components/overlay';
import { getBackupPresets, type BackupPreset } from '../backup-presets';
import { useUi } from '../../../store/ui';
import { t, translateServiceMessage } from "../../../lib/i18n";

export function TargetForm({ target, onClose, onSaved, }: {
    target: BackupTarget | null;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const backupPresets = getBackupPresets();
    const config = (target?.config ?? {}) as unknown as Record<string, unknown>;
    const [type, setType] = useState<BackupTargetType>(target?.type ?? 's3');
    const [name, setName] = useState(target?.name ?? '');
    const [form, setForm] = useState({
        endpoint: String(config.endpoint ?? ''),
        region: String(config.region ?? 'auto'),
        bucket: String(config.bucket ?? ''),
        prefix: String(config.prefix ?? 'inkstone'),
        pathStyle: config.pathStyle !== false,
        url: String(config.url ?? ''),
        username: String(config.username ?? ''),
    });
    const [secret, setSecret] = useState({ accessKeyId: '', secretAccessKey: '', password: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [result, setResult] = useState<TestConnectionResult | null>(null);
    const [activePreset, setActivePreset] = useState<string | null>(null);
    const actionRef = useRef(false);
    const toast = useUi((s) => s.toast);
    const canKeepSecret = Boolean(target?.hasSecret && type === target.type);
    useEffect(() => setResult(null), [type, form, secret]);
    const applyFields = (fields: BackupPreset['fields']) => {
        setForm((f) => ({
            ...f,
            endpoint: fields.endpoint !== undefined ? fields.endpoint : f.endpoint,
            region: fields.region !== undefined ? fields.region : f.region,
            pathStyle: fields.pathStyle ?? f.pathStyle,
            url: fields.url !== undefined ? fields.url : f.url,
        }));
    };
    const applyBackupPreset = (preset: BackupPreset) => {
        setActivePreset(preset.id);
        setType(preset.type);
        setName(preset.name);
        applyFields(preset.fields);
    };
    const selectType = (nextType: BackupTargetType) => {
        if (nextType === type)
            return;
        setType(nextType);
        if (activePreset)
            setName('');
        setActivePreset(null);
    };
    const guide = backupPresets.find((p) => p.id === activePreset) ?? null;
    const recommendedPresets = backupPresets.filter((preset) => preset.type === type);
    const buildPayload = (): BackupTargetInput => ({
        type,
        name: name || (type === 's3' ? t("settings.s3_backup") : t("settings.webdav_backup")),
        config: type === 's3'
            ? {
                endpoint: form.endpoint,
                region: form.region,
                bucket: form.bucket,
                prefix: form.prefix,
                pathStyle: form.pathStyle,
                mode: 'archive',
            }
            : { url: form.url, username: form.username, prefix: form.prefix, mode: 'archive' },
        secret: type === 's3'
            ? { accessKeyId: secret.accessKeyId, secretAccessKey: secret.secretAccessKey }
            : { password: secret.password },
    });
    const save = async () => {
        if (actionRef.current)
            return;
        actionRef.current = true;
        setIsSaving(true);
        try {
            if (target)
                await api.backup.patch(target.id, { ...buildPayload(), expectedUpdatedAt: target.updatedAt });
            else
                await api.backup.create(buildPayload());
            toast({ title: target ? t("settings.backup_target_updated") : t("settings.backup_target_added"), tone: 'success' });
            await onSaved();
        }
        catch (err) {
            toast({
                title: t("common.save_failed"),
                description: err instanceof ApiError ? err.message : String(err),
                tone: 'danger',
            });
        }
        finally {
            actionRef.current = false;
            setIsSaving(false);
        }
    };
    const test = async () => {
        if (actionRef.current)
            return;
        actionRef.current = true;
        setIsTesting(true);
        setResult(null);
        try {
            const payload = buildPayload();
            setResult(target
                ? await api.backup.test(target.id, payload)
                : await api.backup.testDraft(payload));
        }
        catch (err) {
            setResult({ ok: false, message: err instanceof ApiError ? err.message : String(err) });
        }
        finally {
            actionRef.current = false;
            setIsTesting(false);
        }
    };
    const close = () => {
        if (!actionRef.current)
            onClose();
    };
    return (<Modal open onClose={close} title={target ? t("settings.edit_backup_target") : t("settings.add_backup_target")} description={canKeepSecret ? t("settings.leave_the_key_blank_to_leave_it_unchanged") : undefined} width={520} footer={<>
          <Button variant="ghost" onClick={close} disabled={isSaving || isTesting}>{t("common.cancel")}</Button>
          <Button variant="secondary" loading={isTesting} disabled={isSaving} onClick={() => void test()}>{t("settings.test_connection")}</Button>
          <Button variant="primary" loading={isSaving} disabled={isTesting} onClick={() => void save()}>{t("common.save")}</Button>
        </>}>
      <fieldset disabled={isSaving || isTesting} aria-busy={isSaving || isTesting} className="min-w-0 space-y-3.5 border-0 p-0">
        {target && type !== target.type && (<div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--warning)_28%,var(--border-subtle))] bg-[var(--bg-inset)] px-3 py-2 text-[length:var(--text-11\.5)] text-[var(--warning)]">
            <AlertCircle size={13} className="mt-0.5 shrink-0"/>
            <span>{t("settings.enter_the_complete_credentials_for_the_new_backup_type_after_switching_t")}</span>
          </div>)}
        <Field label={t("settings.type")}>
          <Segmented<BackupTargetType> value={type} onChange={selectType} options={[
            { value: 's3', label: t("settings.s3_compatible") },
            { value: 'webdav', label: 'WebDAV' },
        ]}/>
        </Field>

        {!target && (<div className="space-y-2.5">
            <p className="text-[length:var(--text-11)] font-medium tracking-[0.04em] text-[var(--text-quaternary)]">
              {type === 'webdav' ? 'WebDAV' : 'S3'} · {t("settings.common_provider_presets_optional_click_to_autofill")}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {recommendedPresets.map((preset) => (<button key={preset.id} type="button" onClick={() => applyBackupPreset(preset)} className={cn('flex flex-col gap-0.5 rounded-[var(--r-md)] border px-2.5 py-2 text-left', 'transition-colors duration-[var(--dur-fast)]', activePreset === preset.id
                    ? 'border-[var(--accent)] bg-[var(--accent-softer)]'
                    : 'border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]')}>
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className={cn('truncate text-[length:var(--text-12)] font-medium', activePreset === preset.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
                      {preset.name}
                    </span>
                    <span className="shrink-0 text-[length:var(--text-9\.5)] uppercase tracking-wide text-[var(--text-quaternary)]">
                      {preset.type === 'webdav' ? 'DAV' : 'S3'}
                    </span>
                  </span>
                  <span className="text-[length:var(--text-10\.5)] text-[var(--success)]">{preset.quota}</span>
                </button>))}
            </div>

            {guide && (<div className="anim-rise rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--accent)_28%,transparent)] bg-[var(--accent-softer)] px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[length:var(--text-12)] font-medium text-[var(--text-primary)]">
                    {guide.name} · {guide.tagline}
                  </span>
                  <a href={guide.signupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-0.5 text-[length:var(--text-11)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                    {guide.signupLabel ?? t("settings.sign_up")}
                    <ExternalLink size={10}/>
                  </a>
                </div>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-secondary)] marker:text-[var(--accent)]">
                  {guide.steps.map((step, index) => (<li key={index}>
                      {step.map((part, partIndex) => part.href ? (<a key={partIndex} href={part.href} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--accent)] underline decoration-[color-mix(in_oklab,var(--accent)_35%,transparent)] underline-offset-2 hover:decoration-[var(--accent)]">
                          {part.text}
                        </a>) : (<span key={partIndex}>{part.text}</span>))}
                    </li>))}
                </ol>
                {guide.addressIntro && guide.addresses && (<div className="mt-2 border-t border-[color-mix(in_oklab,var(--accent)_18%,transparent)] pt-2">
                    <p className="text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)]">{guide.addressIntro}</p>
                    <dl className="mt-1.5 grid gap-1 sm:grid-cols-2">
                      {guide.addresses.map((address) => (<div key={address.label} className="min-w-0 rounded-[var(--r-sm)] bg-[var(--bg-surface)] px-2 py-1.5">
                          <dt className="text-[length:var(--text-10\.5)] font-medium text-[var(--text-secondary)]">{address.label}</dt>
                          <dd className="mt-0.5 overflow-x-auto whitespace-nowrap font-mono text-[length:var(--text-10)] text-[var(--text-quaternary)]">{address.url}</dd>
                        </div>))}
                    </dl>
                  </div>)}
              </div>)}
          </div>)}

        <Field label={t("settings.name")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.for_example_primary_r2_backup")}/>
        </Field>

        {type === 's3' ? (<>
            <Field label={t("settings.endpoint")} hint={t("settings.leave_blank_unless_the_provider_requires_it_for_r2_use_url")}>
              <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://…"/>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("settings.bucket")} required>
                <Input value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} placeholder="my-notes-backup"/>
              </Field>
              <Field label={t("settings.region")}>
                <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="auto"/>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("settings.access_key_id")} required={!canKeepSecret}>
                <Input value={secret.accessKeyId} onChange={(e) => setSecret({ ...secret, accessKeyId: e.target.value })} placeholder={canKeepSecret ? t("settings.unchanged") : ''} autoComplete="off"/>
              </Field>
              <Field label={t("settings.secret_access_key")} required={!canKeepSecret}>
                <Input type="password" value={secret.secretAccessKey} onChange={(e) => setSecret({ ...secret, secretAccessKey: e.target.value })} placeholder={canKeepSecret ? t("settings.unchanged") : ''} autoComplete="new-password"/>
              </Field>
            </div>
            <Checkbox checked={form.pathStyle} onChange={(pathStyle) => setForm({ ...form, pathStyle })} label={t("settings.use_path_style_access_recommended_for_most_compatible_services")}/>
          </>) : (<>
            <Field label={t("settings.webdav_address")} required hint={t("settings.https_only_redirects_within_the_same_site_are_handled_automatically")}>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://dav.example.com/dav/"/>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("common.username")} required>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off"/>
              </Field>
              <Field label={t("common.password")} required={!canKeepSecret} hint={t("settings.use_an_app_specific_password_when_possible")}>
                <Input type="password" value={secret.password} onChange={(e) => setSecret({ ...secret, password: e.target.value })} placeholder={canKeepSecret ? t("settings.unchanged") : ''} autoComplete="new-password"/>
              </Field>
            </div>
          </>)}

        <Field label={t("settings.subdirectory")} hint={t("settings.store_backups_in_this_directory_or_leave_blank_to_use_the_root_directory")}>
          <Input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} placeholder="inkstone"/>
        </Field>

        {result && (<div role={result.ok ? 'status' : 'alert'} className={cn('flex items-start gap-2 rounded-[var(--r-md)] px-3 py-2.5 text-[length:var(--text-12)] leading-relaxed', result.ok
                ? 'bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-[var(--success)]'
                : 'bg-[color-mix(in_oklab,var(--danger)_11%,transparent)] text-[var(--danger)]')}>
            {result.ok ? (<CheckCircle2 size={13} className="mt-px shrink-0"/>) : (<AlertCircle size={13} className="mt-px shrink-0"/>)}
            <span>{translateServiceMessage(result.message)}</span>
          </div>)}
      </fieldset>
    </Modal>);
}
