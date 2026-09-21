import { BarChart3, Check, Copy, Dices, ExternalLink, FolderClosed, Hash, LayoutGrid, Plus, QrCode, ShieldAlert, Trash2, X } from 'lucide-react'
import { useId } from 'react'
import { LIMITS } from '@shared/constants'
import { Button, IconButton } from '../../../components/primitives'
import { Input, Segmented, Select, Switch } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { KEEP_CURRENT_EXPIRY } from '../share-form'
import { generateRandomSlug } from '../share-helpers'
import type { ShareEditModalBundle } from './use-share-edit-modal'

export function ShareLinkCard({ b, onClose }: { b: ShareEditModalBundle; onClose: () => void }) {
  const { share, isCopied, handleCopyLink, setIsAnalyticsOpen, setIsQrOpen, openPanel } = b
  if (!share?.url) return null
  return (
    <div className='rounded-[var(--r-md)] border border-[var(--accent-soft)] bg-[var(--accent-soft)]/20 p-3 space-y-2.5'>
      <div className='flex items-center gap-2'>
        <Input
          type='text'
          readOnly
          value={share.url}
          aria-label={t('share.share_link')}
          className="flex-1 font-mono text-[length:var(--text-11\.5)] bg-[var(--bg-surface)] select-all"
        />
        <Button size='sm' variant='secondary' icon={isCopied ? <Check size={13} className='text-[var(--success)]' /> : <Copy size={13} />} onClick={() => void handleCopyLink()}>
          {isCopied ? t('common.copied') : t('common.copy')}
        </Button>
        <a
          href={share.url}
          target='_blank'
          rel='noreferrer'
          className='inline-flex h-7 items-center justify-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors'
          title={t('share.open_link')}
        >
          <ExternalLink size={13} />
        </a>
      </div>
      <div className='flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border-subtle)]/60'>
        <Button size='sm' variant='secondary' icon={<BarChart3 size={13} className='text-[var(--accent)]' />} onClick={() => setIsAnalyticsOpen(true)}>
          {t('share.note_analytics_title')}
        </Button>
        <Button size='sm' variant='secondary' icon={<QrCode size={13} />} onClick={() => setIsQrOpen(true)}>
          {t('share.qr_code_title')}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          icon={<LayoutGrid size={13} />}
          onClick={() => {
            onClose()
            openPanel('share-hub')
          }}
          className='ml-auto text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs'
        >
          {t('share.manage_shares')}
        </Button>
      </div>
    </div>
  )
}

export function ShareStatusCard({ b }: { b: ShareEditModalBundle }) {
  const { isEnabled, setIsEnabled } = b
  return (
    <div className='flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3'>
      <div>
        <div className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
          {t('share.share_status')}
        </div>
        <div className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {isEnabled ? t('share.status_active_desc') : t('share.status_paused_desc')}
        </div>
      </div>
      <Switch checked={isEnabled} onChange={setIsEnabled} label={t('share.share_status')} />
    </div>
  )
}

export function ShareFolderCard({ b }: { b: ShareEditModalBundle }) {
  const { shareFolders, shareFolderId, setShareFolderId } = b
  return (
    <div className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3'>
      <div className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)] flex items-center gap-1.5 pb-1.5'>
        <FolderClosed size={14} className='text-[var(--text-tertiary)]' />
        <span>{t('share.folders_isolation')}</span>
      </div>
      <Select
        value={shareFolderId ?? ''}
        onChange={(e) => setShareFolderId(e.target.value ? e.target.value : null)}
        aria-label={t('share.folders_isolation')}
        className='w-full'
      >
        <option value=''>{t('navigation.unfiled')}</option>
        {shareFolders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

export function ShareTagsCard({ b }: { b: ShareEditModalBundle }) {
  const { shareTags, newTagInput, setNewTagInput, handleAddTag, handleRemoveTag } = b
  return (
    <div className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 space-y-2'>
      <div className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)] flex items-center gap-1.5'>
        <Hash size={14} className='text-[var(--text-tertiary)]' />
        <span>{t('share.tags_isolation')}</span>
      </div>
      <div className='flex flex-wrap items-center gap-1.5 min-h-6'>
        {shareTags.length === 0 ? (
          <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('share.no_tags')}</span>
        ) : (
          shareTags.map((tagName) => (
            <span key={tagName} className='inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--bg-hover)] border border-[var(--border-subtle)] px-2 py-0.5 text-[length:var(--text-11)] font-medium text-[var(--text-secondary)]'>
              <Hash size={10} className='text-[var(--accent)]' />
              <span>{tagName}</span>
              <IconButton
                size='sm'
                label={t('share.remove_tag')}
                onClick={() => handleRemoveTag(tagName)}
                className='text-[var(--text-quaternary)] hover:bg-transparent hover:text-[var(--danger)]'
              >
                <X size={11} />
              </IconButton>
            </span>
          ))
        )}
      </div>
      <div className='flex items-center gap-1.5 pt-1'>
        <Input
          type='text'
          value={newTagInput}
          onChange={(e) => setNewTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddTag()
            }
          }}
          placeholder={t('tags.new_placeholder')}
          aria-label={t('tags.new_placeholder')}
          className='flex-1 text-xs'
        />
        <Button size='sm' variant='secondary' icon={<Plus size={12} />} onClick={handleAddTag}>
          {t('tags.create')}
        </Button>
      </div>
    </div>
  )
}

export function ShareSlugCard({ b }: { b: ShareEditModalBundle }) {
  const { shouldUseCustomSlug, setShouldUseCustomSlug, customSlug, setCustomSlug, isSlugChecking, slugAvailable, slugError } = b
  return (
    <div className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3'>
      <div className='flex items-center justify-between pb-2'>
        <div>
          <div className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
            {t('share.custom_slug')}
          </div>
          <div className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
            {t('share.custom_slug_hint')}
          </div>
        </div>
        <Switch checked={shouldUseCustomSlug} onChange={setShouldUseCustomSlug} label={t('share.custom_slug')} />
      </div>
      {shouldUseCustomSlug && (
        <div className='pt-2'>
          <SlugEditorRow
            customSlug={customSlug}
            setCustomSlug={setCustomSlug}
            isSlugChecking={isSlugChecking}
            slugAvailable={slugAvailable}
          />
          {slugError && <p className='pt-1 text-[length:var(--text-11)] text-[var(--danger)]'>{slugError}</p>}
        </div>
      )}
    </div>
  )
}

function SlugEditorRow({ customSlug, setCustomSlug, isSlugChecking, slugAvailable }: {
  customSlug: string
  setCustomSlug: (slug: string) => void
  isSlugChecking: boolean
  slugAvailable: boolean | null
}) {
  return (
    <div className='flex items-center gap-1.5'>
      <span className='text-[length:var(--text-12)] font-mono text-[var(--text-quaternary)]'>{'/s/'}</span>
      <Input
        type='text'
        value={customSlug}
        onChange={(e) => setCustomSlug(e.target.value)}
        placeholder={t('share.custom_slug_placeholder')}
        aria-label={t('share.custom_slug')}
        className='flex-1 font-mono text-[length:var(--text-12)]'
      />
      {isSlugChecking && <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{t('common.checking')}</span>}
      {!isSlugChecking && slugAvailable === true && (
        <Check size={14} className='text-[var(--success)]' />
      )}
      {!isSlugChecking && slugAvailable === false && (
        <ShieldAlert size={14} className='text-[var(--danger)]' />
      )}
      <Button
        size='sm'
        variant='ghost'
        icon={<Dices size={12} />}
        onClick={() => setCustomSlug(generateRandomSlug(6))}
        title={t('share.generate_random_slug')}
        className='shrink-0 text-[var(--accent)]'
      >
        {t('share.random_slug_btn')}
      </Button>
    </div>
  )
}

export function SharePasswordCard({ b }: { b: ShareEditModalBundle }) {
  const { shouldUsePassword, setShouldUsePassword, password, setPassword, share } = b
  return (
    <div className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3'>
      <div className='flex items-center justify-between pb-2'>
        <div>
          <div className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
            {t('share.access_password')}
          </div>
          <div className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
            {t('share.password_hint')}
          </div>
        </div>
        <Switch checked={shouldUsePassword} onChange={setShouldUsePassword} label={t('share.access_password')} />
      </div>
      {shouldUsePassword && (
        <div className='pt-2'>
          <Input
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={share?.hasPassword ? t('share.leave_blank_to_keep_passcode') : t('share.enter_a_passcode')}
            maxLength={LIMITS.passwordMaxLength}
          />
        </div>
      )}
    </div>
  )
}

export function ShareExpiryCard({ b }: { b: ShareEditModalBundle }) {
  const { share, EXPIRY_OPTIONS, expiry, setExpiry } = b
  const titleId = useId()
  return (
    <div className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3'>
      <div id={titleId} className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)] pb-1.5'>
        {t('share.expiration_title')}
      </div>
      <Segmented
        aria-labelledby={titleId}
        options={share?.expiresAt ? [{ value: KEEP_CURRENT_EXPIRY, label: t('share.keep_current') }, ...EXPIRY_OPTIONS] : EXPIRY_OPTIONS}
        value={expiry}
        onChange={setExpiry}
      />
    </div>
  )
}

export function EditModalFooter({ b, onClose }: { b: ShareEditModalBundle; onClose: () => void }) {
  const { share, isSaving, isRevoking, isLoadingShare, handleSave, handleRevoke } = b
  return (
    <div className='flex w-full items-center justify-between gap-2'>
      {share ? (
        <Button
          size='sm'
          variant='ghost'
          className='text-[var(--danger)] hover:bg-[var(--danger-soft)]'
          icon={<Trash2 size={13} />}
          loading={isRevoking}
          disabled={isSaving}
          onClick={() => void handleRevoke()}
        >
          {t('share.revoke_link')}
        </Button>
      ) : (
        <span />
      )}
      <div className='flex items-center gap-2'>
        <Button size='sm' variant='secondary' onClick={onClose} disabled={isSaving || isRevoking}>
          {t('common.cancel')}
        </Button>
        <Button size='sm' variant='primary' loading={isSaving} disabled={isRevoking || isLoadingShare} onClick={() => void handleSave()}>
          {share ? t('share.update_settings') : t('share.publish')}
        </Button>
      </div>
    </div>
  )
}