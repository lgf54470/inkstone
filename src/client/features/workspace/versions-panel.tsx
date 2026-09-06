import { History, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatBytes, fullTime } from '../../lib/time';
import { useRelativeTime } from '../../lib/hooks';
import { Button } from '../../components/primitives';
import { Modal } from '../../components/overlay';
import { Empty, LoadingBlock } from '../../components/feedback';
import { useVersionsPanel, type VersionsPanelBundle } from './use-versions-panel';
import { t } from '../../lib/i18n';

function VersionAge({ timestamp }: { timestamp: number }) {
  return useRelativeTime(timestamp);
}

function ModalFooter({ b, onClose }: { b: VersionsPanelBundle; onClose: () => void }) {
  const { selectedId, preview, previewError, isBusy, restore } = b;
  return (
    <>
      <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
      <Button
        variant="primary"
        icon={<RotateCcw size={13} />}
        disabled={!selectedId || preview === null || Boolean(previewError) || isBusy}
        loading={isBusy}
        onClick={() => void restore()}
      >
        {t('workspace.restore_this_version_da5169')}
      </Button>
    </>
  );
}

function VersionList({ b }: { b: VersionsPanelBundle }) {
  const { versions, note, selectedId, setSelected } = b;
  return (
    <ul className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-subtle)] pb-2 md:block md:w-[210px] md:space-y-px md:overflow-y-auto md:border-r md:border-b-0 md:pr-2 md:pb-0">
      {versions!.map((version, index) => (
        <li key={version.id} className="w-[188px] shrink-0 md:w-auto">
          <button
            type="button"
            aria-pressed={selectedId === version.id}
            onClick={() => setSelected({ noteId: note!.id, versionId: version.id })}
            className={cn(
              'w-full rounded-[var(--r-md)] px-2 py-2 text-left transition-colors',
              selectedId === version.id ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]',
            )}
          >
            <div className="flex items-center gap-1.5 text-[length:var(--text-12)] font-medium text-[var(--text-primary)]">
              <History size={11} className="shrink-0 text-[var(--text-quaternary)]" />
              {index === 0 ? t('workspace.latest') : <VersionAge timestamp={version.createdAt} />}
            </div>
            <div className="mt-0.5 pl-4 text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
              {fullTime(version.createdAt)} · {formatBytes(version.size)}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DiffLineRow({ line }: { line: { kind: 'same' | 'add' | 'remove'; text: string } }) {
  return (
    <div className={cn('px-1', line.kind === 'add' && 'bg-[color-mix(in_oklab,var(--success)_14%,transparent)]', line.kind === 'remove' && 'bg-[color-mix(in_oklab,var(--danger)_14%,transparent)]', line.kind === 'same' && 'text-[var(--text-tertiary)]')}>
      <span className="mr-2 inline-block w-2 text-[var(--text-quaternary)]">
        {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
      </span>
      {line.text || ' '}
    </div>
  );
}

function DiffView({ b }: { b: VersionsPanelBundle }) {
  const { diff, previewError, setPreviewReload } = b;
  if (previewError) {
    return (
      <Empty
        art="notes"
        compact
        title={t('workspace.could_not_load_version')}
        description={previewError}
        action={<Button size="sm" variant="secondary" onClick={() => setPreviewReload((value) => value + 1)}>{t('common.retry')}</Button>}
      />
    );
  }
  if (!diff) return <LoadingBlock />;
  return (
    <>
      <div className="sticky top-0 flex items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-inset)] px-3 py-1.5 text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
        <span>{t('workspace.differences_from_current_content')}</span>
        <span className="text-[var(--success)]">+{diff.added}</span>
        <span className="text-[var(--danger)]">-{diff.removed}</span>
        {diff.simplified && <span>{t('workspace.large_content_using_a_faster_comparison')}</span>}
      </div>
      <pre className="p-3 font-mono text-[length:var(--text-11\.5)] leading-[1.65] whitespace-pre-wrap">
        {diff.lines.map((line, i) => (
          <DiffLineRow key={i} line={line} />
        ))}
      </pre>
    </>
  );
}

function DiffPane({ b }: { b: VersionsPanelBundle }) {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)]">
      <DiffView b={b} />
    </div>
  );
}

export function VersionsPanel({ onClose }: { onClose: () => void }) {
  const b = useVersionsPanel(onClose);
  const { note, versions, versionsError, setVersionsReload } = b;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('common.version_history')}
      description={note ? t('workspace.autosave_for_value0', { value0: note.title }) : undefined}
      width={880}
      footer={<ModalFooter b={b} onClose={onClose} />}
    >
      {versionsError ? (
        <Empty
          art="notes"
          compact
          title={t('workspace.could_not_load_version_history')}
          description={versionsError}
          action={<Button size="sm" variant="secondary" onClick={() => setVersionsReload((value) => value + 1)}>{t('common.retry')}</Button>}
        />
      ) : versions === null ? (
        <LoadingBlock />
      ) : versions.length === 0 ? (
        <Empty art="notes" compact title={t('workspace.no_version_history_yet')} description={t('workspace.a_snapshot_is_saved_every_few_minutes_or_after_larger_edits')} />
      ) : (
        <div className="flex h-[min(68dvh,560px)] min-h-0 flex-col gap-3 md:h-[440px] md:flex-row">
          <VersionList b={b} />
          <DiffPane b={b} />
        </div>
      )}
    </Modal>
  );
}