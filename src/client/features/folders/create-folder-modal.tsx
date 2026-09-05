import { useState } from 'react';
import { Modal } from '../../components/overlay';
import { Button } from '../../components/primitives';
import { useNotes } from '../../store/notes';
import { t } from '../../lib/i18n';

export function CreateFolderModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (folderId: string) => void;
}) {
  const [name, setName] = useState('');
  const createFolder = useNotes((s) => s.createFolder);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const folderId = createFolder({ name: trimmed });
    if (folderId && onCreated) {
      onCreated(folderId);
    }
    setName('');
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => {
        setName('');
        onClose();
      }}
      title={t('common.new_folder')}
      description={t('folders.create_and_move_desc')}
      width={400}
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setName('');
              onClose();
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-folder-modal-form"
            disabled={!name.trim()}
            data-autofocus
          >
            {t('folders.create_new')}
          </Button>
        </>
      }
    >
      <form id="create-folder-modal-form" onSubmit={handleSubmit} className="pt-1">
        <label className="block">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('common.new_folder')}
            className="h-10 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-[length:var(--text-13)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-ring)]"
          />
        </label>
      </form>
    </Modal>
  );
}
