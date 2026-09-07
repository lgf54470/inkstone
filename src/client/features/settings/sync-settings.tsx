import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';
import { errorMessage } from '../../lib/errors';
import { useRelativeTime } from '../../lib/hooks';
import { Button } from '../../components/primitives';
import { SettingRow, Slider, Switch } from '../../components/form';
import { useSession } from '../../store/session';
import { useNotes, type NotesState } from '../../store/notes';
import { useUi, type UiState } from '../../store/ui';
import { t } from '../../lib/i18n';
export function SyncSettings() {
  const sync = useSession((s) => s.settings.sync);
  const site = useSession((s) => s.site);
  const update = useSession((s) => s.updateSettings);
  const online = useNotes((s) => s.online);
  const lastSavedAt = useNotes((s) => s.lastSavedAt);
  const pending = useNotes((s) => s.pendingCount);
  const pull = useNotes((s) => s.pull);
  const replayPending = useNotes((s) => s.replayPending);
  const toast = useUi((s) => s.toast);
  const syncingRef = useRef(false);
  const mountedRef = useRef(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const realtimeAvailable = site?.realtimeEnabled ?? false;
  const savedAgo = useRelativeTime(lastSavedAt, online);
  const setRealtime = useCallback((realtime: boolean) => void update({ sync: { realtime } }), [update]);
  const setPollInterval = useCallback((seconds: number) => void update({ sync: { pollIntervalMs: seconds * 1000 } }), [update]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      syncingRef.current = false;
    };
  }, []);
  const syncNow = () => void syncNowFlow({ pull, replayPending, toast, syncingRef, mountedRef, setIsSyncing });
  return (<div className='space-y-6'>
    <SyncStatusCard online={online} lastSavedAt={lastSavedAt} pending={pending} savedAgo={savedAgo} isSyncing={isSyncing} onSyncNow={syncNow}/>

    <section>
    {realtimeAvailable && (<SettingRow title={t('settings.realtime_sync')} description={t('settings.receive_changes_from_other_devices_quickly')}>
      <Switch checked={sync.realtime} onChange={setRealtime} label={t('settings.realtime_sync')}/>
    </SettingRow>)}

    <SettingRow title={t('settings.polling_interval')}>
      <Slider label={t('settings.polling_interval')} className='w-[200px]' value={Math.round(sync.pollIntervalMs / 1000)} min={5} max={120} step={5} onChange={setPollInterval} suffix={t('settings.sec')}/>
    </SettingRow>
    </section>
  </div>);
}

async function syncNowFlow({ pull, replayPending, toast, syncingRef, mountedRef, setIsSyncing }: {
  pull: NotesState['pull'];
  replayPending: () => Promise<void>;
  toast: UiState['toast'];
  syncingRef: React.MutableRefObject<boolean>;
  mountedRef: React.MutableRefObject<boolean>;
  setIsSyncing: (syncing: boolean) => void;
}) {
  if (syncingRef.current)
    return;
  syncingRef.current = true;
  setIsSyncing(true);
  try {
    let failure: unknown = null;
    try {
      await pull({ force: true });
    }
    catch (error) {
      failure = error;
    }
    try {
      await replayPending();
    }
    catch (error) {
      failure ??= error;
    }
    if (!useNotes.getState().online) {
      toast({ title: t('settings.offline'), tone: 'warning' });
      return;
    }
    if (failure)
      throw failure;
    toast({ title: t('settings.reloaded_all_data'), tone: 'success' });
  }
  catch (error) {
    toast({
      title: t('common.action_failed'),
      description: errorMessage(error),
      tone: 'danger',
    });
  }
  finally {
    syncingRef.current = false;
    if (mountedRef.current)
      setIsSyncing(false);
  }
}

function SyncStatusCard({ online, lastSavedAt, pending, savedAgo, isSyncing, onSyncNow }: { online: boolean; lastSavedAt: number; pending: number; savedAgo: string; isSyncing: boolean; onSyncNow: () => void }) {
  return (
    <section className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4'>
      <div className='flex items-center gap-2.5'>
      <span className={online
      ? 'text-[var(--success)]'
      : 'text-[var(--warning)]'}>
      {online ? <CheckCircle2 size={16}/> : <CloudOff size={16}/>}
      </span>
      <div className='min-w-0 flex-1'>
      <div className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
        {online ? t('settings.connected') : t('settings.offline')}
      </div>
      <div className="mt-0.5 text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">
        {online
      ? lastSavedAt
        ? t('settings.last_saved_value0', { value0: savedAgo }) : t('settings.no_saves_yet')
      : pending
        ? t('settings.value0_changes_will_upload_automatically_after_reconnecting', { value0: pending }) : t('settings.changes_are_saved_locally_and_sync_automatically_after_reconnecting')}
      </div>
      </div>
      <Button size='sm' variant='secondary' icon={<RefreshCw size={12}/>} loading={isSyncing} disabled={isSyncing} onClick={onSyncNow}>{t('settings.sync_now')}</Button>
    </div>

    </section>
  );
}