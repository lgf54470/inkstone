import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart2,
  Check,
  ChevronRight,
  Copy,
  FolderClosed,
  FolderMinus,
  Hash,
  Plus,
  QrCode,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import type { ShareInfo } from '@shared/types';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { t } from '../../lib/i18n';
import { useUi } from '../../store/ui';
import { confirm } from '../../components/overlay';
import { useShareStore } from './share-store';

export function ShareNoteSubmenu({
  noteId,
  noteTitle,
  share: initialShare,
  closeMenu,
  onOpenSettings,
  onOpenQr,
  onOpenAnalytics,
}: {
  noteId: string;
  noteTitle: string;
  share?: ShareInfo | null;
  closeMenu: () => void;
  onOpenSettings: () => void;
  onOpenQr: (url: string, title: string, slug: string) => void;
  onOpenAnalytics: (share: ShareInfo) => void;
}) {
  const toast = useUi((s) => s.toast);
  const shares = useShareStore((s) => s.shares);
  const currentShare = useMemo(() => {
    return shares.find((s) => s.noteId === noteId) ?? initialShare ?? null;
  }, [shares, noteId, initialShare]);

  const [view, setView] = useState<'main' | 'folder' | 'tags'>('main');
  const [folderQuery, setFolderQuery] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [, setBusy] = useState(false);

  const shareFolders = useShareStore((s) => s.folders);
  const shareTags = useShareStore((s) => s.tags);
  const loadFolders = useShareStore((s) => s.loadFolders);
  const loadTags = useShareStore((s) => s.loadTags);

  useEffect(() => {
    void loadFolders();
    void loadTags();
  }, [loadFolders, loadTags]);

  const ensureShare = async (): Promise<ShareInfo | null> => {
    if (currentShare) return currentShare;
    setBusy(true);
    try {
      const res = await api.share.create(noteId, { isEnabled: true });
      await useShareStore.getState().loadShares();
      return res.share;
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleOpenQr = async () => {
    const s = await ensureShare();
    if (!s) return;
    closeMenu();
    onOpenQr(s.url, noteTitle, s.slug);
  };

  const handleCopyLink = async () => {
    const s = await ensureShare();
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s.url);
      toast({ title: t('common.copied'), tone: 'success' });
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' });
    }
    closeMenu();
  };

  const handleOpenAnalytics = async () => {
    const s = await ensureShare();
    if (!s) return;
    closeMenu();
    onOpenAnalytics(s);
  };

  const handleSelectFolder = async (folderId: string | null) => {
    setBusy(true);
    try {
      if (currentShare) {
        await useShareStore.getState().batchMoveToFolder([noteId], folderId);
      } else {
        await api.share.create(noteId, { isEnabled: true, folderId });
        await useShareStore.getState().loadShares();
      }
      const targetFolder = shareFolders.find((f) => f.id === folderId);
      toast({
        title: targetFolder
          ? t('notes.move_to_value0', { value0: targetFolder.name })
          : t('share.batch_move_success', { count: 1 }),
        tone: 'success',
      });
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' });
    } finally {
      setBusy(false);
      closeMenu();
    }
  };

  const handleAddTag = async (tagName: string) => {
    const tag = tagName.trim();
    if (!tag) return;
    const existingTags = currentShare?.shareTags ?? [];
    if (existingTags.includes(tag)) {
      setNewTagInput('');
      return;
    }
    const nextTags = [...existingTags, tag];
    setBusy(true);
    try {
      await api.share.create(noteId, { isEnabled: true, tags: nextTags });
      await useShareStore.getState().loadShares();
      setNewTagInput('');
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const existingTags = currentShare?.shareTags ?? [];
    const nextTags = existingTags.filter((t) => t !== tagToRemove);
    setBusy(true);
    try {
      await api.share.create(noteId, { isEnabled: true, tags: nextTags });
      await useShareStore.getState().loadShares();
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    const ok = await confirm({
      title: t('share.revoke_this_public_link'),
      description: t('share.anyone_who_gets_the_link_will_immediately_lose_access'),
      confirmLabel: t('share.cancel_share'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.share.remove(noteId);
      toast({ title: t('share.link_revoked'), tone: 'default' });
      void useShareStore.getState().loadShares();
      closeMenu();
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const currentFolder = shareFolders.find((f) => f.id === currentShare?.shareFolderId);
  const currentTags = currentShare?.shareTags ?? [];

  const filteredFolders = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    if (!q) return shareFolders;
    return shareFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [shareFolders, folderQuery]);

  const availableSuggestedTags = useMemo(() => {
    const currentSet = new Set(currentTags);
    return shareTags.filter((t) => !currentSet.has(t.name));
  }, [shareTags, currentTags]);

  if (view === 'folder') {
    return (
      <div
        className="w-[248px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1.5 shadow-[var(--shadow-pop)] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-2 text-[12.5px] font-medium text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setView('main')}
            className="flex size-5 items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            title={t('share.back')}
          >
            <ArrowLeft size={13} />
          </button>
          <span>{t('share.batch_move_to_folder')}</span>
        </div>

        {/* Search input */}
        <div className="px-1 py-1.5">
          <div className="relative flex items-center border-b-2 border-[var(--accent)] pb-1">
            <input
              autoFocus
              type="text"
              value={folderQuery}
              onChange={(e) => setFolderQuery(e.target.value)}
              placeholder={t('folders.search')}
              className="w-full bg-transparent pr-6 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)]"
            />
            <Search size={13} className="pointer-events-none absolute right-0 text-[var(--text-quaternary)]" />
          </div>
        </div>

        {/* Folder list */}
        <div className="max-h-[200px] overflow-y-auto space-y-0.5 px-0.5 pt-0.5">
          <button
            type="button"
            onClick={() => void handleSelectFolder(null)}
            className={cn(
              'group flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[12px] transition-colors',
              !currentShare?.shareFolderId
                ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            )}
          >
            <FolderMinus size={13} className="shrink-0 text-[var(--text-tertiary)]" />
            <span className="min-w-0 flex-1 truncate">{t('navigation.unfiled')}</span>
            {!currentShare?.shareFolderId && <Check size={12} className="text-[var(--accent)]" />}
          </button>

          {filteredFolders.map((f) => {
            const isSelected = currentShare?.shareFolderId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => void handleSelectFolder(f.id)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[12px] transition-colors',
                  isSelected
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                )}
              >
                <FolderClosed
                  size={13}
                  style={{ color: f.color ?? undefined }}
                  className="shrink-0 text-[var(--text-tertiary)]"
                />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {isSelected && <Check size={12} className="text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === 'tags') {
    return (
      <div
        className="w-[248px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)] outline-none space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] pb-1.5 border-b border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setView('main')}
            className="flex size-5 items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            title={t('share.back')}
          >
            <ArrowLeft size={13} />
          </button>
          <span>{t('share.tags_isolation')}</span>
        </div>

        {/* Current tags chips */}
        <div className="flex flex-wrap gap-1 min-h-[26px]">
          {currentTags.length === 0 ? (
            <span className="text-[11px] text-[var(--text-quaternary)] py-0.5">{t('share.no_tags')}</span>
          ) : (
            currentTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--bg-hover)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
              >
                <Hash size={10} className="text-[var(--accent)]" />
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => void handleRemoveTag(tag)}
                  className="text-[var(--text-quaternary)] hover:text-[var(--danger)]"
                >
                  <X size={10} />
                </button>
              </span>
            ))
          )}
        </div>

        {/* Add tag input */}
        <div className="flex items-center gap-1 pt-1 border-t border-[var(--border-subtle)]">
          <input
            autoFocus
            type="text"
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAddTag(newTagInput);
              }
            }}
            placeholder={t('share.tag_placeholder')}
            className="flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => void handleAddTag(newTagInput)}
            className="flex size-6 items-center justify-center rounded-[var(--r-sm)] bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Suggested tags */}
        {availableSuggestedTags.length > 0 && (
          <div className="pt-1">
            <div className="text-[10px] text-[var(--text-quaternary)] pb-1">{t('tags.manage_tags')}</div>
            <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
              {availableSuggestedTags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void handleAddTag(t.name)}
                  className="inline-flex items-center gap-0.5 rounded-[var(--r-sm)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] border border-transparent transition-colors"
                >
                  <Plus size={9} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="w-[236px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none space-y-0.5 text-[12.5px]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. View QR code */}
      <button
        type="button"
        onClick={() => void handleOpenQr()}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <QrCode size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate">{t('share.view_qr')}</span>
      </button>

      {/* 2. Copy public link */}
      <button
        type="button"
        onClick={() => void handleCopyLink()}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Copy size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate">{t('share.copy_link')}</span>
      </button>

      {/* 3. Move to folder */}
      <button
        type="button"
        onClick={() => setView('folder')}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <FolderClosed size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate">{t('share.batch_move_to_folder')}</span>
        <span className="max-w-[70px] truncate text-[11px] text-[var(--text-quaternary)]">
          {currentFolder ? currentFolder.name : t('navigation.unfiled')}
        </span>
        <ChevronRight size={12} className="shrink-0 opacity-60" />
      </button>

      {/* 4. Move to tags */}
      <button
        type="button"
        onClick={() => setView('tags')}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Hash size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate">{t('share.tags_isolation')}</span>
        <span className="text-[11px] text-[var(--text-quaternary)]">
          {currentTags.length > 0 ? `${currentTags.length}` : t('share.no_tags')}
        </span>
        <ChevronRight size={12} className="shrink-0 opacity-60" />
      </button>

      {/* 5. View analytics */}
      <button
        type="button"
        onClick={() => void handleOpenAnalytics()}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <BarChart2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate">{t('share.view_note_analytics')}</span>
      </button>

      {/* 6. Edit share settings */}
      <button
        type="button"
        onClick={() => {
          closeMenu();
          onOpenSettings();
        }}
        className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Settings2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate">{t('share.edit_share_settings')}</span>
      </button>

      {/* 7. Revoke share if currently shared */}
      {currentShare && (
        <>
          <div role="separator" className="my-1 h-px bg-[var(--border-subtle)]" />
          <button
            type="button"
            onClick={() => void handleRevoke()}
            className="flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[var(--danger)] transition-colors hover:bg-[var(--danger-subtle)]"
          >
            <Trash2 size={13} className="shrink-0 text-[var(--danger)]" />
            <span className="min-w-0 flex-1 truncate">{t('share.cancel_share')}</span>
          </button>
        </>
      )}
    </div>
  );
}
