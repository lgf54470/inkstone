import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, FileJson, FileUp, FolderOpen, ImageIcon, RefreshCw, Share2, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatBytes, formatNumber } from '../../lib/time';
import { Button } from '../../components/primitives';
import { LoadingBlock } from '../../components/feedback';
import { SettingRow } from '../../components/form';
import { confirm } from '../../components/overlay';
import { useUi, type UiState } from '../../store/ui';
import { useNotes } from '../../store/notes';
import { AttachmentManager } from '../attachments';
import { t } from '../../lib/i18n';
import { restoreMarkdownBackupFolder } from '../../lib/backup-import';

export function DataSettings() {
  const d = useDataSettings();
  return (<div className='space-y-6'>
    <OverviewSection d={d}/>
    <AttachmentSection d={d}/>
    <ShareHubSection d={d}/>
    <ExportSection d={d}/>
    <ImportSection d={d}/>
    <MaintenanceSection d={d}/>
    <AttachmentManager open={d.isAttachmentManagerOpen} onClose={() => d.setIsAttachmentManagerOpen(false)} onChanged={() => void d.loadStats()}/>
  </div>);
}

type DataState = ReturnType<typeof useDataSettings>;
type ToastFn = UiState['toast'];
type RunTask = (key: string, task: () => Promise<void>) => void;
type DataStore = ReturnType<typeof useDataStore>;

function useDataStore() {
  const toast = useUi((s) => s.toast);
  const openPanel = useUi((s) => s.openPanel);
  const emptyTrash = useNotes((s) => s.emptyTrash);
  const pull = useNotes((s) => s.pull);
  return { toast, openPanel, emptyTrash, pull };
}

function useDataBusy(): { busy: string | null; run: RunTask } {
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const run = (key: string, task: () => Promise<void>) => void runTaskFlow({ key, task, busyRef, setBusy });
  return { busy, run };
}

function useDataSettings() {
  const store = useDataStore();
  const { busy, run } = useDataBusy();
  const [isAttachmentManagerOpen, setIsAttachmentManagerOpen] = useState(false);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupFolderRef = useRef<HTMLInputElement>(null);
  const statsEpoch = useRef(0);
  const mountedRef = useRef(true);
  const loadStats = useCallback(() => void loadStatsFlow({ mountedRef, statsEpoch, setStats, setStatsError }), []);
  useEffect(() => {
    mountedRef.current = true;
    void loadStats();
    return () => {
      mountedRef.current = false;
      statsEpoch.current++;
    };
  }, [loadStats]);
  const actions = useDataActions(store, run, loadStats);
  return {
    isAttachmentManagerOpen,
    setIsAttachmentManagerOpen,
    stats,
    statsError,
    busy,
    fileRef,
    backupFolderRef,
    openPanel: store.openPanel,
    loadStats,
    ...actions,
  };
}

function useDataActions(store: DataStore, run: RunTask, loadStats: () => void) {
  const exportData = (format: 'zip' | 'json') => run(`export-${format}`, () => exportDataFlow(format, store.toast));
  const restoreBackup = (files: File[]) => run('restore-backup', () => restoreBackupFlow(files, store, loadStats));
  const importFiles = (files: File[]) => run('import', () => importFilesFlow(files, store, loadStats));
  const reindex = () => run('reindex', () => reindexFlow(store));
  const prune = () => run('prune', () => pruneFlow(store, loadStats));
  const trash = () => run('trash', () => trashFlow(store, loadStats));
  return { exportData, restoreBackup, importFiles, reindex, prune, trash };
}

async function loadStatsFlow({ mountedRef, statsEpoch, setStats, setStatsError }: {
  mountedRef: React.MutableRefObject<boolean>;
  statsEpoch: React.MutableRefObject<number>;
  setStats: (stats: Record<string, number>) => void;
  setStatsError: (error: string | null) => void;
}) {
  if (!mountedRef.current)
    return;
  const epoch = ++statsEpoch.current;
  setStatsError(null);
  try {
    const result = await api.settings.stats();
    if (mountedRef.current && epoch === statsEpoch.current) {
      setStats(result);
      setStatsError(null);
    }
  }
  catch (error) {
    if (mountedRef.current && epoch === statsEpoch.current) {
      setStatsError(error instanceof Error ? error.message : t('settings.could_not_load_data_overview'));
    }
  }
}

async function runTaskFlow({ key, task, busyRef, setBusy }: {
  key: string;
  task: () => Promise<void>;
  busyRef: React.MutableRefObject<string | null>;
  setBusy: (busy: string | null) => void;
}) {
  if (busyRef.current)
    return;
  busyRef.current = key;
  setBusy(key);
  try {
    await task();
  }
  finally {
    if (busyRef.current === key) {
      busyRef.current = null;
      setBusy(null);
    }
  }
}

async function exportDataFlow(format: 'zip' | 'json', toast: ToastFn) {
  try {
    await api.transfer.save(format);
  }
  catch (error) {
    toast({
      title: t('common.export_failed'),
      description: errorMessage(error),
      tone: 'danger',
    });
  }
}

type ImportResult = Awaited<ReturnType<typeof api.transfer.import>>;

async function restoreBackupFlow(files: File[], store: DataStore, loadStats: () => void) {
  try {
    const result = await restoreMarkdownBackupFolder(files, (batch, manifest, paths) => api.transfer.import(batch, 'newer', { manifest, paths }));
    await reportImportFlow({ result, pull: store.pull, loadStats, toast: store.toast });
  }
  catch (err) {
    store.toast({ title: t('settings.import_failed'), description: errorMessage(err), tone: 'danger' });
  }
}

async function importFilesFlow(files: File[], store: DataStore, loadStats: () => void) {
  try {
    const result = await api.transfer.import(files);
    await reportImportFlow({ result, pull: store.pull, loadStats, toast: store.toast });
  }
  catch (err) {
    store.toast({ title: t('settings.import_failed'), description: errorMessage(err), tone: 'danger' });
  }
}

async function reindexFlow(store: DataStore) {
  try {
    const res = await api.reindex();
    store.toast({ title: t('settings.rebuilt_the_index_for_value0_notes', { value0: res.indexed }), tone: 'success' });
  }
  catch (err) {
    store.toast({ title: t('settings.rebuild_failed'), description: errorMessage(err), tone: 'danger' });
  }
}

async function pruneFlow(store: DataStore, loadStats: () => void) {
  const ok = await confirm({
    title: t('settings.clean_unreferenced_attachments_a17dbd'),
    description: t('settings.only_files_that_do_not_appear_in_the_body_of_any_note_will_be_deleted_an'),
    confirmLabel: t('settings.clean_up'),
    tone: 'danger',
  });
  if (!ok)
    return;
  try {
    const res = await api.files.prune();
    void loadStats();
    store.toast({
      title: res.removed ? t('settings.cleaned_value0_attachments', { value0: res.removed }) : t('settings.there_are_no_attachments_to_clean'),
      description: res.removed ? t('settings.freed_value0', { value0: formatBytes(res.freedBytes) }) : undefined,
      tone: 'success',
    });
  }
  catch (err) {
    store.toast({ title: t('settings.cleanup_failed'), description: errorMessage(err), tone: 'danger' });
  }
}

async function trashFlow(store: DataStore, loadStats: () => void) {
  const ok = await confirm({
    title: t('common.empty_trash'),
    description: t('settings.cannot_be_undone'),
    confirmLabel: t('common.clear'),
    tone: 'danger',
  });
  if (!ok)
    return;
  try {
    const purged = await store.emptyTrash();
    if (purged === null)
      return;
    void loadStats();
    store.toast({ title: t('common.permanently_deleted_value0_notes', { value0: purged }), tone: 'success' });
  }
  catch (err) {
    store.toast({ title: t('common.delete_failed'), description: errorMessage(err), tone: 'danger' });
  }
}

async function reportImportFlow({ result, pull, loadStats, toast }: {
  result: ImportResult;
  pull: DataStore['pull'];
  loadStats: () => void;
  toast: ToastFn;
}) {
  const refreshed = await pull({ force: true }).then(() => true, () => false);
  void loadStats();
  const summary = t('settings.created_value0_updated_value1_skipped_value2_restored_value3_attachments', { value0: result.createdNotes, value1: result.updatedNotes, value2: result.skippedNotes, value3: result.createdAttachments, value4: result.skippedAttachments });
  const details = [summary];
  if (result.warnings.length)
    details.push(result.warnings[0]);
  if (!refreshed)
    details.push(t('settings.operation_completed_but_refresh_failed'));
  toast({
    title: t('settings.import_completed'),
    description: details.join('\uFF1B'),
    tone: result.warnings.length || !refreshed ? 'warning' : 'success',
    duration: 7000,
  });
  if (result.warnings.length)
    console.warn(t('settings.inkstone_import_reminder'), result.warnings);
}

function OverviewSection({ d }: { d: DataState }) {
  return (
    <section>
      <h3 className='mb-2 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]'>{t('settings.overview')}</h3>
      {d.stats === null ? (
      d.statsError ? <StatsLoadError d={d}/> : <LoadingBlock label={t('common.loading')}/>
      ) : (
      <>
        {d.statsError && <InlineStatsError d={d}/>}
        <StatsGrid stats={d.stats}/>
      </>
      )}
    </section>
  );
}

function StatsLoadError({ d }: { d: DataState }) {
  return (
    <div role='alert' className='flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--danger)_25%,var(--border-subtle))] bg-[var(--bg-base)] px-3 py-3'>
      <AlertCircle size={14} className='mt-0.5 shrink-0 text-[var(--danger)]'/>
      <div className='min-w-0 flex-1'>
      <div className="text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">{t('settings.could_not_load_data_overview')}</div>
      <p className="mt-0.5 break-words text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">{d.statsError}</p>
      </div>
      <Button size='sm' variant='secondary' onClick={() => void d.loadStats()}>{t('common.retry')}</Button>
    </div>
  );
}

function InlineStatsError({ d }: { d: DataState }) {
  return (
    <div role='alert' className="mb-2 flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--danger)_25%,var(--border-subtle))] bg-[var(--bg-base)] px-3 py-2 text-[length:var(--text-11\.5)] text-[var(--danger)]">
      <AlertCircle size={13} className='mt-0.5 shrink-0'/>
      <span className='min-w-0 flex-1 break-words'>{d.statsError}</span>
      <button type='button' className='shrink-0 font-medium underline underline-offset-2' onClick={() => void d.loadStats()}>{t('common.retry')}</button>
    </div>
  );
}

function StatsGrid({ stats }: { stats: Record<string, number> }) {
  const items = [
    { label: t('common.note'), value: stats.notes ?? 0 },
    { label: t('navigation.folder'), value: stats.folders ?? 0 },
    { label: t('navigation.tag'), value: stats.tags ?? 0 },
    { label: t('common.wiki_links'), value: stats.links ?? 0 },
    { label: t('settings.total_words'), value: stats.words ?? 0 },
    { label: t('settings.version_history'), value: stats.versions ?? 0 },
    { label: t('settings.attachments'), value: stats.attachments ?? 0 },
    { label: t('navigation.trash'), value: stats.trashed ?? 0 },
  ];
  return (
    <>
      <div className='grid grid-cols-2 gap-2 md:grid-cols-4'>
      {items.map((item) => (
        <div key={item.label} className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5'>
        <div className='text-[length:var(--text-17)] font-semibold tabular tracking-[-0.02em] text-[var(--text-primary)]'>
          {formatNumber(item.value)}
        </div>
        <div className='mt-0.5 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{item.label}</div>
        </div>
      ))}
      </div>
      {stats.attachmentBytes ? (<p className="mt-2 text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]">{t('settings.attachment_storage')}{formatBytes(stats.attachmentBytes)}
      </p>) : null}
    </>
  );
}

function AttachmentSection({ d }: { d: DataState }) {
  return (
    <section>
      <h3 className='mb-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]'>{t('settings.attachments')}</h3>
      <SettingRow title={t('attachments.manage')} description={t('attachments.manage_description')}>
      <Button size='sm' icon={<ImageIcon size={13}/>} onClick={() => d.setIsAttachmentManagerOpen(true)}>{t('attachments.manage')}</Button>
      </SettingRow>
    </section>
  );
}

function ShareHubSection({ d }: { d: DataState }) {
  return (
    <section>
      <h3 className='mb-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]'>{t('share.hub_title')}</h3>
      <SettingRow title={t('share.manage_shares')} description={t('share.manage_shares_description')}>
      <Button size='sm' icon={<Share2 size={13}/>} onClick={() => d.openPanel('share')}>{t('share.manage_shares')}</Button>
      </SettingRow>
    </section>
  );
}

function ExportSection({ d }: { d: DataState }) {
  return (
    <section>
      <h3 className='mb-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]'>{t('settings.export')}</h3>
      <SettingRow title={t('settings.export_to_zip')} description={t('settings.includes_every_note_folder_tag_and_attachment_for_a_complete_restore_plu')}>
      <Button size='sm' icon={<Download size={13}/>} loading={d.busy === 'export-zip'} disabled={d.busy !== null} onClick={() => d.exportData('zip')}>{t('settings.download_zip')}</Button>
      </SettingRow>
      <SettingRow title={t('settings.export_to_json')} description={t('settings.structured_note_data_without_attachment_binaries_download_zip_for_a_comp')}>
      <Button size='sm' variant='ghost' icon={<FileJson size={13}/>} loading={d.busy === 'export-json'} disabled={d.busy !== null} onClick={() => d.exportData('json')}>{t('settings.download_json')}</Button>
      </SettingRow>
    </section>
  );
}

function ImportSection({ d }: { d: DataState }) {
  return (
    <section>
      <h3 className='mb-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]'>{t('settings.import')}</h3>
      <SettingRow title={t('settings.restore_backup_folder')} description={t('settings.restore_backup_folder_description')}>
      <Button size='sm' icon={<FolderOpen size={13}/>} loading={d.busy === 'restore-backup'} disabled={d.busy !== null} onClick={() => d.backupFolderRef.current?.click()}>{t('settings.select_backup_folder')}</Button>
      </SettingRow>
      <input ref={d.backupFolderRef} type='file' hidden multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={async (event) => {
      const files = [...(event.target.files ?? [])];
      event.target.value = '';
      if (files.length)
        d.restoreBackup(files);
      }}/>
      <SettingRow title={t('settings.import_file')} description={t('settings.supports_md_txt_zip_and_inkstone_json_exports_for_matching_ids_the_newer')}>
      <Button size='sm' icon={<FileUp size={13}/>} loading={d.busy === 'import'} disabled={d.busy !== null} onClick={() => d.fileRef.current?.click()}>{t('settings.select_file')}</Button>
      </SettingRow>
      <input ref={d.fileRef} type='file' hidden multiple accept='.md,.markdown,.txt,.json,.zip' onChange={async (event) => {
      const files = [...(event.target.files ?? [])];
      event.target.value = '';
      if (files.length)
        d.importFiles(files);
      }}/>
    </section>
  );
}

function MaintenanceSection({ d }: { d: DataState }) {
  return (
    <section>
      <h3 className='mb-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]'>{t('settings.maintenance')}</h3>
      <SettingRow title={t('settings.rebuild_search_index')} description={t('settings.try_this_when_your_search_results_don_t_look_right')}>
      <Button size='sm' variant='secondary' icon={<RefreshCw size={13}/>} loading={d.busy === 'reindex'} disabled={d.busy !== null} onClick={d.reindex}>{t('settings.rebuild_index')}</Button>
      </SettingRow>
      <SettingRow title={t('settings.clean_unreferenced_attachments')} description={t('settings.delete_pictures_and_files_that_no_longer_appear_in_any_notes')}>
      <Button size='sm' variant='secondary' icon={<Sparkles size={13}/>} loading={d.busy === 'prune'} disabled={d.busy !== null} onClick={d.prune}>{t('settings.clean_up')}</Button>
      </SettingRow>
      <SettingRow title={t('settings.empty_trash')} description={t('settings.permanently_delete_every_note_in_trash')}>
      <Button size='sm' variant='ghost' icon={<Trash2 size={13}/>} className='text-[var(--danger)]' loading={d.busy === 'trash'} disabled={d.busy !== null} onClick={d.trash}>{t('common.clear')}</Button>
      </SettingRow>
    </section>
  );
}