import { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { type BackupRun } from '@shared/types';
import { cn } from '../../../lib/cn';
import { formatBytes, formatDuration } from '../../../lib/time';
import { useRelativeTime } from '../../../lib/hooks';
import { t, translateServiceMessage } from "../../../lib/i18n";

export function RunRow({ run }: {
    run: BackupRun;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const tone = run.status === 'success' ? 'success' : run.status === 'partial' ? 'warning' : 'danger';
    const startedTime = useRelativeTime(run.startedAt);
    return (<li className="overflow-hidden rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]">
        <span className={cn('size-1.5 shrink-0 rounded-full', tone === 'success'
            ? 'bg-[var(--success)]'
            : tone === 'warning'
                ? 'bg-[var(--warning)]'
                : 'bg-[var(--danger)]')}/>
        <span className="min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-secondary)]">
          {startedTime} · {run.trigger === 'cron' ? t("settings.scheduled") : t("settings.manual")}
        </span>
        <span className="shrink-0 text-[length:var(--text-11)] tabular text-[var(--text-quaternary)]">
          {run.noteCount}{t("settings.notes")}{formatBytes(run.bytes)}
          {run.finishedAt ? ` · ${formatDuration(run.finishedAt - run.startedAt)}` : ''}
        </span>
      </button>

      {isOpen && run.results.length > 0 && (<ul className="border-t border-[var(--border-subtle)] bg-[var(--bg-inset)] px-3 py-2">
          {run.results.map((result, index) => (<li key={`${result.targetId}-${index}`} className="flex items-start gap-2 py-1 text-[length:var(--text-11\.5)]">
              {result.ok ? (<CheckCircle2 size={11} className="mt-0.5 shrink-0 text-[var(--success)]"/>) : (<AlertCircle size={11} className="mt-0.5 shrink-0 text-[var(--danger)]"/>)}
              <span className="shrink-0 text-[var(--text-secondary)]">{result.targetName}</span>
              <span className="min-w-0 flex-1 text-[var(--text-quaternary)]">
                {result.ok
                    ? t("settings.value0_files_value1_value2", { value0: result.files, value1: formatBytes(result.bytes), value2: formatDuration(result.ms) }) : translateServiceMessage(result.error)}
              </span>
            </li>))}
        </ul>)}
    </li>);
}
