import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CloudUpload, Plus, Zap } from 'lucide-react';
import { type BackupRun, type BackupSchedule, type BackupTarget } from '@shared/types';
import { api, ApiError } from '../../../lib/api';
import { formatBytes } from '../../../lib/time';
import { Button } from '../../../components/primitives';
import { Segmented, SettingRow } from '../../../components/form';
import { Empty, LoadingBlock } from '../../../components/feedback';
import { useSession } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { t, translateServiceMessage, useLocale } from "../../../lib/i18n";

import { TargetCard } from './target-card';
import { TargetForm } from './target-form';
import { RunRow } from './run-row';

export function BackupSettings() {
    const schedule = useSession((s) => s.settings.backup.schedule);
    const update = useSession((s) => s.updateSettings);
    const locale = useLocale();
    const setSchedule = useCallback((next: BackupSchedule) => void update({ backup: { schedule: next } }), [update]);
    const scheduleOptions = useMemo(() => ([{
        value: 'off' as const,
        label: t("common.close"),
    }, {
        value: 'hourly' as const,
        label: t("settings.hourly"),
    }, {
        value: 'sixHourly' as const,
        label: t("settings.every_6_hours"),
    }, {
        value: 'daily' as const,
        label: t("settings.daily"),
    }]), [locale]);
    const toast = useUi((s) => s.toast);
    const [targets, setTargets] = useState<BackupTarget[] | null>(null);
    const [runs, setRuns] = useState<BackupRun[]>([]);
    const [editing, setEditing] = useState<BackupTarget | 'new' | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const reloadEpoch = useRef(0);
    const runningRef = useRef(false);
    const mountedRef = useRef(true);
    const reload = useCallback(async () => {
        if (!mountedRef.current)
            return;
        const epoch = ++reloadEpoch.current;
        try {
            const [t, r] = await Promise.all([api.backup.targets(), api.backup.runs()]);
            if (!mountedRef.current || epoch !== reloadEpoch.current)
                return;
            setTargets(t.targets);
            setRuns(r.runs);
            setLoadError(null);
        }
        catch (error) {
            if (!mountedRef.current || epoch !== reloadEpoch.current)
                return;
            setLoadError(error instanceof ApiError ? error.message : String(error));
        }
    }, []);
    useEffect(() => {
        mountedRef.current = true;
        void reload();
        return () => {
            mountedRef.current = false;
            runningRef.current = false;
            reloadEpoch.current++;
        };
    }, [reload]);
    const runBackup = async () => {
        if (runningRef.current)
            return;
        runningRef.current = true;
        setIsRunning(true);
        try {
            const run = await api.backup.run();
            await reload();
            const ok = run.results.filter((r) => r.ok).length;
            toast({
                title: run.status === 'success'
                    ? t("settings.backup_completed_value0_targets", { value0: ok }) : run.status === 'partial'
                    ? t("settings.partially_completed_value0_value1", { value0: ok, value1: run.results.length }) : t("settings.backup_failed"),
                description: run.status === 'success'
                    ? t("settings.value0_notes_value1", { value0: run.noteCount, value1: formatBytes(run.bytes) }) : translateServiceMessage(run.results.find((r) => !r.ok)?.error) || t("settings.no_enabled_backup_targets"),
                tone: run.status === 'success' ? 'success' : run.status === 'partial' ? 'warning' : 'danger',
                duration: 8000,
            });
        }
        catch (err) {
            toast({
                title: t("settings.backup_failed"),
                description: err instanceof ApiError ? err.message : String(err),
                tone: 'danger',
            });
        }
        finally {
            runningRef.current = false;
            if (mountedRef.current)
                setIsRunning(false);
        }
    };
    if (targets === null && loadError)
        return (<div className="rounded-[var(--r-lg)] border border-[color-mix(in_oklab,var(--danger)_28%,var(--border-subtle))] bg-[var(--bg-base)] p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-[var(--danger)]"/>
            <div className="min-w-0 flex-1">
              <div className="text-[length:var(--text-13)] font-medium text-[var(--text-primary)]">{t("settings.could_not_load_backup_settings")}</div>
              <p className="mt-1 break-words text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">{loadError}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void reload()}>{t("common.retry")}</Button>
          </div>
        </div>);
    if (targets === null)
        return <LoadingBlock label={t("settings.loading_backup_configuration")}/>;
    const enabled = targets.filter((t) => t.enabled).length;
    return (<div className="space-y-6">
      {loadError && (<div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--danger)_25%,var(--border-subtle))] bg-[var(--bg-base)] px-3 py-2 text-[length:var(--text-11\.5)] text-[var(--danger)]">
          <AlertCircle size={13} className="mt-0.5 shrink-0"/>
          <span className="min-w-0 flex-1 break-words">{loadError}</span>
          <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={() => void reload()}>{t("common.retry")}</button>
        </div>)}
      { }
      <section className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[var(--accent)]">
            <CloudUpload size={18}/>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[length:var(--text-13)] font-medium text-[var(--text-primary)]">
              {enabled > 0 ? t("settings.value0_backup_targets_active", { value0: enabled }) : t("settings.no_backup_configured_yet")}
            </div>
            <p className="mt-1 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">{t("settings.each_backup_goes_independently_to_every_enabled_target_it_includes_notes")}</p>
          </div>
          <Button size="sm" variant="primary" icon={isRunning ? undefined : <Zap size={13}/>} loading={isRunning} disabled={!enabled} onClick={() => void runBackup()}>{t("settings.back_up_now")}</Button>
        </div>
      </section>

      { }
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("settings.backup_target")}</h3>
          <Button size="sm" variant="secondary" icon={<Plus size={13}/>} onClick={() => setEditing('new')}>{t("settings.add_target")}</Button>
        </div>

        {targets.length === 0 ? (<div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)]">
            <Empty art="archive" compact title={t("settings.no_backup_target_yet")} description={t("settings.add_a_webdav_or_s3_compatible_target_or_choose_a_common_provider_preset")} action={<Button size="sm" icon={<Plus size={13}/>} onClick={() => setEditing('new')}>{t("settings.add_first_target")}</Button>}/>
          </div>) : (<div className="space-y-2">
            {targets.map((target) => (<TargetCard key={target.id} target={target} onEdit={() => setEditing(target)} onChanged={reload} onPatch={(id, patch) => setTargets((current) => current?.map((item) => item.id === id ? { ...item, ...patch } : item) ?? current)} onRemove={(id) => setTargets((current) => current?.filter((item) => item.id !== id) ?? current)} onRestore={(removed) => setTargets((current) => current && !current.some((item) => item.id === removed.id) ? [...current, removed] : current)}/>))}
          </div>)}
      </section>

      { }
      <section>
        <h3 className="mb-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("settings.automatic_backups")}</h3>
        <SettingRow title={t("settings.frequency")} description={t("settings.runs_from_cloudflare_cron_the_page_does_not_need_to_stay_open")}>
          <Segmented<BackupSchedule> label={t("settings.frequency")} value={schedule} onChange={setSchedule} options={scheduleOptions}/>
        </SettingRow>
      </section>

      { }
      <section>
        <h3 className="mb-2 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("settings.latest_backups")}</h3>
        {runs.length === 0 ? (<p className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-3 py-4 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">{t("settings.no_backup_record_yet")}</p>) : (<ul className="space-y-1">
            {runs.slice(0, 12).map((run) => (<RunRow key={run.id} run={run}/>))}
          </ul>)}
      </section>

      {editing && (<TargetForm target={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => {
                setEditing(null);
                await reload();
            }}/>)}
    </div>);
}

