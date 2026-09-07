import { useEffect, useRef, useState } from 'react'
import { Check, RefreshCw, RotateCcw, Upload } from 'lucide-react'
import { isBitmapAvatarDataUrl, parseStoredAvatarUrl } from '@shared/avatar'
import { Avatar, Button } from '../../components/primitives'
import { Modal } from '../../components/overlay'
import {
  AvatarUploadError,
  createRandomAvatarPreferences,
  prepareAvatarUpload,
} from '../../lib/avatar'
import { ApiError } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useSession } from '../../store/session'
import { useUi, type UiState } from '../../store/ui'
type ToastFn = UiState['toast'];

const MODAL_WIDTH = 620

export function AvatarPicker({
  open,
  onClose,
  displayName,
  preference,
}: {
  open: boolean
  onClose: () => void
  displayName: string
  preference: string
}) {
  const picker = useAvatarPicker({ open, onClose, displayName, preference })
  return (
    <Modal
      open={open}
      onClose={picker.close}
      title={t('settings.change_avatar')}
      width={MODAL_WIDTH}
      footer={(
        <>
          <Button variant='ghost' onClick={picker.close} disabled={picker.isBusy || picker.isProcessing}>
            {t('common.cancel')}
          </Button>
          <Button variant='primary' onClick={picker.save} loading={picker.isBusy} disabled={picker.isProcessing || picker.selected === preference}>
            {t('common.save')}
          </Button>
        </>
      )}
    >
      <div className='space-y-5'>
        <SelectedAvatarCard picker={picker} />
        <RandomAvatarGrid picker={picker} />
        <UploadSection picker={picker} />
        {picker.error && <p role='alert' className='text-[length:var(--text-12)] text-[var(--danger)]'>{picker.error}</p>}
      </div>
    </Modal>
  )
}

type PickerState = ReturnType<typeof useAvatarPicker>;

function useAvatarPicker({ open, onClose, displayName, preference }: { open: boolean; onClose: () => void; displayName: string; preference: string }) {
  const updateProfile = useSession((state) => state.updateProfile)
  const toast = useUi((state) => state.toast)
  const inputRef = useRef<HTMLInputElement>(null)
  const [choices, setChoices] = useState<string[]>([])
  const [selected, setSelected] = useState(preference)
  const [isBusy, setIsBusy] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const processingRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setSelected(preference)
    setChoices(createRandomAvatarPreferences())
    setError(null)
  }, [open, preference])

  const close = () => {
    if (!busyRef.current && !processingRef.current) onClose()
  }
  const save = () => void saveAvatarFlow({ selected, preference, updateProfile, busyRef, processingRef, setIsBusy, setError, toast, close })
  const chooseFile = (file: File | undefined) => void chooseAvatarFileFlow({ file, busyRef, processingRef, setIsProcessing, setError, setSelected, inputRef })
  const selectionLabel = selected === ''
    ? t('settings.name_based_avatar')
    : isBitmapAvatarDataUrl(selected) || parseStoredAvatarUrl(selected)
      ? t('settings.uploaded_avatar')
      : t('settings.random_avatar')
  return { inputRef, choices, setChoices, selected, setSelected, isBusy, isProcessing, error, save, close, chooseFile, selectionLabel, displayName }
}

async function saveAvatarFlow({ selected, preference, updateProfile, busyRef, processingRef, setIsBusy, setError, toast, close }: {
  selected: string;
  preference: string;
  updateProfile: (patch: { name?: string; avatarUrl?: string }) => Promise<unknown>;
  busyRef: React.MutableRefObject<boolean>;
  processingRef: React.MutableRefObject<boolean>;
  setIsBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  toast: ToastFn;
  close: () => void;
}) {
  if (busyRef.current || processingRef.current) return
  if (selected === preference) return close()
  busyRef.current = true
  setIsBusy(true)
  setError(null)
  try {
    await updateProfile({ avatarUrl: selected })
    toast({ title: t('settings.avatar_saved'), tone: 'success' })
    close()
  } catch (caught) {
    setError(caught instanceof ApiError ? caught.message : t('settings.action_failed_try_again'))
  } finally {
    busyRef.current = false
    setIsBusy(false)
  }
}

async function chooseAvatarFileFlow({ file, busyRef, processingRef, setIsProcessing, setError, setSelected, inputRef }: {
  file: File | undefined;
  busyRef: React.MutableRefObject<boolean>;
  processingRef: React.MutableRefObject<boolean>;
  setIsProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
  setSelected: (selected: string) => void;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  if (!file || busyRef.current || processingRef.current) return
  processingRef.current = true
  setIsProcessing(true)
  setError(null)
  try {
    setSelected(await prepareAvatarUpload(file))
  } catch (caught) {
    setError(avatarUploadError(caught))
  } finally {
    processingRef.current = false
    setIsProcessing(false)
    if (inputRef.current) inputRef.current.value = ''
  }
}

function SelectedAvatarCard({ picker }: { picker: PickerState }) {
  return (
    <div className='flex items-center gap-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4'>
      <Avatar src={picker.selected} name={picker.displayName} size={72} />
      <div className='min-w-0 flex-1'>
        <div className='text-[length:var(--text-12)] font-semibold text-[var(--text-primary)]'>
          {t('settings.selected_avatar')}
        </div>
        <div className="mt-1 text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">{picker.selectionLabel}</div>
      </div>
      <Button size='sm' variant='secondary' icon={<RotateCcw size={12} />} onClick={() => picker.setSelected('')} disabled={picker.isBusy || picker.isProcessing}>
        {t('settings.use_name_avatar')}
      </Button>
    </div>
  )
}

function RandomAvatarGrid({ picker }: { picker: PickerState }) {
  return (
    <section>
      <div className='mb-2.5 flex items-center justify-between gap-3'>
        <h3 className='text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
          {t('settings.random_avatars')}
        </h3>
        <Button size='sm' variant='ghost' icon={<RefreshCw size={12} />} onClick={() => picker.setChoices(createRandomAvatarPreferences())} disabled={picker.isBusy || picker.isProcessing}>
          {t('settings.refresh_avatars')}
        </Button>
      </div>
      <div className='grid grid-cols-5 gap-2.5'>
        {picker.choices.map((choice, index) => {
          const active = picker.selected === choice
          return (
            <button
              key={choice}
              type='button'
              aria-label={t('settings.random_avatar_number', { number: index + 1 })}
              aria-pressed={active}
              disabled={picker.isBusy || picker.isProcessing}
              onClick={() => picker.setSelected(choice)}
              className={`relative flex aspect-square min-w-0 items-center justify-center rounded-[var(--r-lg)] border transition-[border-color,background-color,transform] duration-[var(--dur-fast)] hover:-translate-y-0.5 ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-base)] hover:border-[var(--border-strong)]'
              }`}
            >
              <Avatar src={choice} name={picker.displayName} size={42} className='md:!size-[60px]' />
              {active && (
                <span className='absolute right-1.5 bottom-1.5 flex size-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]'>
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function UploadSection({ picker }: { picker: PickerState }) {
  return (
    <section className='rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)] bg-[var(--bg-inset)] p-4'>
      <div className='flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center'>
        <div>
          <h3 className='text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
            {t('settings.upload_local_image')}
          </h3>
          <p className='mt-1 text-[length:var(--text-11)] leading-relaxed text-[var(--text-quaternary)]'>
            {t('settings.avatar_upload_hint')}
          </p>
        </div>
        <Button variant='secondary' icon={<Upload size={13} />} loading={picker.isProcessing} disabled={picker.isBusy} onClick={() => picker.inputRef.current?.click()}>
          {t('settings.choose_image')}
        </Button>
      </div>
      <input
        ref={picker.inputRef}
        type='file'
        accept='image/png,image/jpeg,image/webp'
        disabled={picker.isBusy || picker.isProcessing}
        className='sr-only'
        onChange={(event) => picker.chooseFile(event.target.files?.[0])}
      />
    </section>
  )
}

function avatarUploadError(caught: unknown): string {
  if (!(caught instanceof AvatarUploadError)) return t('settings.avatar_processing_failed')
  if (caught.code === 'unsupported') return t('settings.avatar_file_unsupported')
  if (caught.code === 'too_large') return t('settings.avatar_file_too_large')
  if (caught.code === 'decode_failed') return t('settings.avatar_decode_failed')
  return t('settings.avatar_processing_failed')
}