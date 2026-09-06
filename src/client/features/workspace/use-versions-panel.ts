import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoteVersionMeta } from '@shared/types';
import { api } from '../../lib/api';
import { confirm } from '../../components/overlay';
import { errorMessage } from '../../lib/errors';
import { useUi } from '../../store/ui';
import { useActiveNote } from '../../store/notes/selectors';
import { useNotes } from '../../store/notes';
import type { NotesState } from '../../store/notes/model';
import type { UiState } from '../../store/ui/types';
import { t } from '../../lib/i18n';

function useVersionsList(noteId: string | undefined, reload: number, onFirstVersion: (noteId: string, versionId: string | null) => void) {
  const [versions, setVersions] = useState<NoteVersionMeta[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  useEffect(() => {
    setVersions(null);
    setVersionsError(null);
    if (!noteId) return;
    const controller = new AbortController();
    let isCancelled = false;
    void (async () => {
      try {
        const res = await api.notes.versions(noteId, controller.signal);
        if (isCancelled) return;
        setVersions(res.versions);
        onFirstVersion(noteId, res.versions[0]?.id ?? null);
      } catch (error) {
        if (!isCancelled) setVersionsError(errorMessage(error));
      }
    })();
    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [noteId, reload, onFirstVersion]);

  return { versions, versionsError };
}

function useVersionPreview(noteId: string | undefined, selectedId: string | null, reload: number) {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!noteId || !selectedId) return;
    const controller = new AbortController();
    let isCancelled = false;
    void (async () => {
      try {
        const v = await api.notes.version(noteId, selectedId, controller.signal);
        if (!isCancelled) setPreview(v.content);
      } catch (error) {
        if (!isCancelled) setPreviewError(errorMessage(error));
      }
    })();
    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [noteId, selectedId, reload]);

  return { preview, previewError };
}

function useVersionRestore(opts: {
  noteId: string | undefined;
  selectedId: string | null;
  preview: string | null;
  previewError: string | null;
  versions: NoteVersionMeta[] | null;
  versionsReload: number;
  restoreVersion: NotesState['restoreVersion'];
  onClose: () => void;
  toast: UiState['toast'];
}) {
  const { noteId, selectedId, preview, previewError, versions, versionsReload, restoreVersion, onClose, toast } = opts;
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  const noteIdRef = useRef(noteId);
  const restoreEpoch = useRef(0);
  noteIdRef.current = noteId;

  useEffect(() => {
    restoreEpoch.current += 1;
    busyRef.current = false;
    setIsBusy(false);
  }, [noteId, versionsReload]);

  useEffect(() => () => {
    restoreEpoch.current += 1;
    busyRef.current = false;
  }, []);

  const restore = async () => {
    if (!noteId || !selectedId || preview === null || previewError || busyRef.current) return;
    const epoch = ++restoreEpoch.current;
    busyRef.current = true;
    setIsBusy(true);
    try {
      const ok = await confirm({
        title: t('workspace.restore_this_version'),
        description: t('workspace.the_current_content_will_be_automatically_saved_as_a_new_version_first_a'),
        confirmLabel: t('common.restore'),
      });
      if (!ok || restoreEpoch.current !== epoch || noteIdRef.current !== noteId) return;
      const versionTitle = versions?.find((version) => version.id === selectedId)?.title;
      void restoreVersion(noteId, selectedId, preview, versionTitle);
      onClose();
    } catch (err) {
      if (restoreEpoch.current === epoch && noteIdRef.current === noteId) {
        toast({ title: t('common.restore_failed'), description: errorMessage(err), tone: 'danger' });
      }
    } finally {
      if (restoreEpoch.current === epoch && noteIdRef.current === noteId) {
        busyRef.current = false;
        setIsBusy(false);
      }
    }
  };

  return { isBusy, restore };
}

export function useVersionsPanel(onClose: () => void) {
  const { note, content } = useActiveNote();
  const toast = useUi((s) => s.toast);
  const restoreVersion = useNotes((s) => s.restoreVersion);
  const [versionsReload, setVersionsReload] = useState(0);
  const [selected, setSelected] = useState<{ noteId: string; versionId: string } | null>(null);
  const [previewReload, setPreviewReload] = useState(0);
  const noteId = note?.id;

  const onFirstVersion = useCallback((loadedNoteId: string, versionId: string | null) => {
    setSelected(versionId ? { noteId: loadedNoteId, versionId } : null);
  }, []);

  const { versions, versionsError } = useVersionsList(noteId, versionsReload, onFirstVersion);
  const selectedId = selected && selected.noteId === noteId ? selected.versionId : null;
  const { preview, previewError } = useVersionPreview(noteId, selectedId, previewReload);
  const { isBusy, restore } = useVersionRestore({ noteId, selectedId, preview, previewError, versions, versionsReload, restoreVersion, onClose, toast });

  const diff = useMemo(() => (preview === null ? null : computeLineDiff(preview, content)), [preview, content]);

  return {
    note,
    content,
    versions,
    versionsError,
    setVersionsReload,
    selectedId,
    setSelected,
    preview,
    previewError,
    setPreviewReload,
    isBusy,
    diff,
    restore,
  };
}

export type VersionsPanelBundle = ReturnType<typeof useVersionsPanel>

interface DiffLine {
  kind: 'same' | 'add' | 'remove';
  text: string;
}

interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  simplified: boolean;
}

const MAX_LCS_CELLS = 600000;
const MAX_RENDERED_DIFF_LINES = 4000;

function computeLineDiff(before: string, after: string): DiffResult {
  const a = before.split('\n');
  const b = after.split('\n');
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) {
    suffix++;
  }
  const head: DiffLine[] = a.slice(0, prefix).map((text) => ({ kind: 'same', text }));
  const tail: DiffLine[] = suffix ? a.slice(a.length - suffix).map((text) => ({ kind: 'same', text })) : [];
  const beforeMiddle = a.slice(prefix, a.length - suffix);
  const afterMiddle = b.slice(prefix, b.length - suffix);
  const simplified = beforeMiddle.length * afterMiddle.length > MAX_LCS_CELLS;
  const middle = simplified
    ? [
        ...beforeMiddle.map((text): DiffLine => ({ kind: 'remove', text })),
        ...afterMiddle.map((text): DiffLine => ({ kind: 'add', text })),
      ]
    : computeMiddleLcs(beforeMiddle, afterMiddle);
  const added = middle.reduce((count, line) => count + (line.kind === 'add' ? 1 : 0), 0);
  const removed = middle.reduce((count, line) => count + (line.kind === 'remove' ? 1 : 0), 0);
  const lines = limitDiffLines([...head, ...middle, ...tail]);
  return { lines, added, removed, simplified };
}

function computeMiddleLcs(a: string[], b: string[]): DiffLine[] {
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    const row = i * width;
    const nextRow = (i + 1) * width;
    for (let j = b.length - 1; j >= 0; j--) {
      table[row + j] = a[i] === b[j] ? table[nextRow + j + 1]! + 1 : Math.max(table[nextRow + j]!, table[row + j + 1]!);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      lines.push({ kind: 'remove', text: a[i]! });
      i++;
    } else {
      lines.push({ kind: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < a.length) lines.push({ kind: 'remove', text: a[i++]! });
  while (j < b.length) lines.push({ kind: 'add', text: b[j++]! });
  return lines;
}

function limitDiffLines(lines: DiffLine[]): DiffLine[] {
  if (lines.length <= MAX_RENDERED_DIFF_LINES) return lines;
  const before = Math.floor((MAX_RENDERED_DIFF_LINES - 1) / 2);
  const after = MAX_RENDERED_DIFF_LINES - before - 1;
  const hidden = lines.length - before - after;
  return [
    ...lines.slice(0, before),
    { kind: 'same', text: t('workspace.value0_unchanged_lines_hidden', { value0: hidden }) },
    ...lines.slice(-after),
  ];
}