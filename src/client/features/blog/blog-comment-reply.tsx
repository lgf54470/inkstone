import { Send, X } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Textarea } from '../../components/form'
import { t } from '../../lib/i18n'

/**
 * The author's answer to one reader (FEA-06). It is an inline form rather than a dialog, so the
 * comment being answered stays on screen; a failed send leaves the draft where it was typed (the
 * failure sentence itself belongs to the store layer), and the send control is disabled while empty.
 */
export function CommentReplyComposer({
  value,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string
  busy: boolean
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <form
      className='mt-3 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-3'
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        disabled={busy}
        autoFocus
        aria-label={t('blog.comment_reply_placeholder')}
        placeholder={t('blog.comment_reply_placeholder')}
      />
      <div className='mt-2 flex items-center justify-end gap-2'>
        <Button type='button' size='sm' variant='ghost' onClick={onCancel} disabled={busy}>
          <X size={12} className='mr-1' />
          {t('common.cancel')}
        </Button>
        <Button type='submit' size='sm' variant='primary' loading={busy} disabled={!value.trim()}>
          <Send size={12} className='mr-1' />
          {t('blog.comment_reply_send')}
        </Button>
      </div>
    </form>
  )
}
