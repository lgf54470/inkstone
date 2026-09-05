import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, HardDrive, Loader2, MoreHorizontal, Server, Trash2 } from 'lucide-react';
import { type BackupTarget, type TestConnectionResult } from '@shared/types';
import { cn } from '../../../lib/cn';
import { api, ApiError } from '../../../lib/api';
import { useRelativeTime } from '../../../lib/hooks';
import { Badge, Button, IconButton } from '../../../components/primitives';
import { Switch } from '../../../components/form';
import { Tooltip, confirm } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { t, translateServiceMessage } from "../../../lib/i18n";

export function TargetCard({ target, onEdit, onChanged, onPatch, onRemove, onRestore, }: {
    target: BackupTarget;
    onEdit: () => void;
    onChanged: () => Promise<void>;
    onPatch: (id: string, patch: Partial<BackupTarget>) => void;
    onRemove: (id: string) => void;
    onRestore: (target: BackupTarget) => void;
}) {
    const toast = useUi((s) => s.toast);
    const [isTesting, setIsTesting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [result, setResult] = useState<TestConnectionResult | null>(null);
    const actionRef = useRef(false);
    const busy = isTesting || isDeleting || isUpdating;
    const lastRunTime = useRelativeTime(target.lastRunAt ?? 0, Boolean(target.lastRunAt));
    useEffect(() => setResult(null), [target.updatedAt]);
    const config = target.config as unknown as Record<string, unknown>;
    const location = target.type === 's3'
        ? `${String(config.bucket ?? '')}${config.prefix ? `/${config.prefix}` : ''}`
        : String(config.url ?? '');
    return (<div className={cn('rounded-[var(--r-lg)] border bg-[var(--bg-base)] p-3 transition-colors', target.enabled ? 'border-[var(--border-subtle)]' : 'border-[var(--border-subtle)] opacity-60')}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--r-md)]', 'bg-[var(--bg-raised)] text-[var(--text-tertiary)]')}>
          {target.type === 's3' ? <HardDrive size={15}/> : <Server size={15}/>}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]">
              {target.name}
            </span>
            <Badge tone="neutral">{target.type === 's3' ? 'S3' : 'WebDAV'}</Badge>
          </div>
          <div className="mt-0.5 truncate text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]">{location}</div>

          {target.lastRunAt && (<div className={cn('mt-1.5 flex items-center gap-1.5 text-[length:var(--text-11)]', target.lastStatus === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>
              {target.lastStatus === 'success' ? (<CheckCircle2 size={11}/>) : (<AlertCircle size={11}/>)}
              {target.lastStatus === 'success' ? t("settings.last_backup_succeeded") : translateServiceMessage(target.lastError) || t("settings.last_backup_failed")}
              <span className="text-[var(--text-quaternary)]">· {lastRunTime}</span>
            </div>)}

          {result && (<div className={cn('mt-1.5 flex items-start gap-1.5 rounded-[var(--r-sm)] px-2 py-1.5 text-[length:var(--text-11)]', result.ok
                ? 'bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-[var(--success)]'
                : 'bg-[color-mix(in_oklab,var(--danger)_11%,transparent)] text-[var(--danger)]')}>
              {result.ok ? <CheckCircle2 size={11} className="mt-px"/> : <AlertCircle size={11} className="mt-px"/>}
              <span className="min-w-0 flex-1">
                {translateServiceMessage(result.message)}
                {result.latencyMs ? ` · ${result.latencyMs}ms` : ''}
              </span>
            </div>)}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Switch checked={target.enabled} disabled={busy} label={t("settings.enabled")} onChange={async (enabled) => {
            if (actionRef.current)
                return;
            actionRef.current = true;
            setIsUpdating(true);
            onPatch(target.id, { enabled });
            try {
                await api.backup.patch(target.id, { enabled, expectedUpdatedAt: target.updatedAt });
                await onChanged();
            }
            catch (error) {
                onPatch(target.id, { enabled: target.enabled });
                toast({ title: t("settings.update_failed"), description: error instanceof ApiError ? error.message : String(error), tone: 'danger' });
            }
            finally {
                actionRef.current = false;
                setIsUpdating(false);
            }
        }}/>
          <Button size="sm" variant="ghost" loading={isTesting} disabled={isUpdating || isDeleting} onClick={async () => {
            if (actionRef.current)
                return;
            actionRef.current = true;
            setIsTesting(true);
            setResult(null);
            try {
                setResult(await api.backup.test(target.id));
            }
            catch (err) {
                setResult({ ok: false, message: err instanceof ApiError ? err.message : String(err) });
            }
            finally {
                actionRef.current = false;
                setIsTesting(false);
            }
        }}>
            {isTesting ? <Loader2 size={12} className="animate-[ink-spin_.7s_linear_infinite]"/> : t("settings.test")}
          </Button>
          <Tooltip label={t("common.edit")}>
            <IconButton label={t("common.edit")} size="sm" disabled={busy} onClick={onEdit}>
              <MoreHorizontal size={14}/>
            </IconButton>
          </Tooltip>
          <Tooltip label={t("common.delete")} side="left">
            <IconButton label={t("common.delete")} size="sm" disabled={busy} className="text-[var(--text-quaternary)] hover:text-[var(--danger)]" onClick={async () => {
            if (actionRef.current)
                return;
            actionRef.current = true;
            setIsDeleting(true);
            try {
                const ok = await confirm({
                    title: t("settings.delete_backup_target_value0", { value0: target.name }),
                    description: t("settings.files_that_have_been_backed_up_there_will_not_be_deleted"),
                    confirmLabel: t("common.delete"),
                    tone: 'danger',
                });
                if (!ok)
                    return;
                onRemove(target.id);
                await api.backup.remove(target.id);
                toast({ title: t("settings.backup_target_deleted") });
                await onChanged();
            }
            catch (error) {
                onRestore(target);
                toast({ title: t("common.delete_failed"), description: error instanceof ApiError ? error.message : String(error), tone: 'danger' });
            }
            finally {
                actionRef.current = false;
                setIsDeleting(false);
            }
        }}>
            {isDeleting ? <Loader2 size={12} className="animate-[ink-spin_.7s_linear_infinite]"/> : <Trash2 size={13}/>}
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </div>);
}
