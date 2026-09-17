import { memo } from 'react'
import { Modal } from '../../../../components/overlay'
import { Kbd } from '../../../../components/primitives'
import { t } from '../../../i18n'

const HELP_DIALOG_WIDTH = 640

interface HelpRow {
  /** Key combination shown in the row, or a plain action name for a tip row. */
  keys?: string
  /** Separate caps, for a row that stands for a set of keys rather than one combination. */
  keyCaps?: string[]
  label: string
}

interface HelpSection {
  title: string
  rows: HelpRow[]
}

// Only what this editor actually does: a help panel that lists shortcuts the app never
// binds teaches the reader to distrust it.
function sections(): HelpSection[] {
  return [
    {
      title: t('slides.help_editing'),
      rows: [
        { keys: 'mod+z', label: t('common.undo') },
        { keys: 'mod+shift+z', label: t('contextmenu.redo') },
        { keys: 'mod+c', label: t('slides.help_keys_copy') },
        { keys: 'mod+x', label: t('slides.help_keys_cut') },
        { keys: 'mod+v', label: t('slides.help_keys_paste') },
        { keys: 'mod+d', label: t('slides.help_keys_duplicate') },
        { keyCaps: ['←', '↑', '↓', '→'], label: t('slides.help_keys_nudge') },
        { keys: 'arrowright', label: t('slides.help_keys_page_next') },
        { keys: 'arrowleft', label: t('slides.help_keys_page_prev') },
        { keys: '?', label: t('slides.help_keys_help') },
        { label: t('slides.help_tip_select') },
        { label: t('slides.help_tip_edit_text') },
        { label: t('slides.help_tip_resize') },
        { label: t('slides.help_tip_inspector') },
        { label: t('slides.help_tip_sidebar') },
      ],
    },
    {
      title: t('slides.help_presenting'),
      rows: [
        { keys: 'arrowright', label: t('slides.help_present_next') },
        { keys: 'arrowleft', label: t('slides.help_present_prev') },
        { keyCaps: ['F5'], label: t('slides.help_keys_start_show') },
        { keys: 's', label: t('slides.speaker_notes') },
        { keys: 'escape', label: t('slides.help_present_exit') },
        { keys: 'mod+=', label: t('slides.help_keys_zoom_in') },
        { keys: 'mod+-', label: t('slides.help_keys_zoom_out') },
        { keys: 'mod+0', label: t('slides.reset_zoom') },
      ],
    },
    {
      title: t('slides.help_saving'),
      rows: [
        { keys: 'mod+s', label: t('slides.help_keys_save') },
        { label: t('slides.help_tip_autosave') },
        { label: t('slides.help_tip_save_button') },
        { label: t('slides.help_tip_print') },
      ],
    },
  ]
}

export const SlidesHelpDialog = memo(function SlidesHelpDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('slides.help_title')}
      description={t('slides.help_description')}
      width={HELP_DIALOG_WIDTH}
    >
      <div className='grid gap-5 md:grid-cols-2'>
        {sections().map((section) => (
          <section key={section.title} className='space-y-2'>
            <h3 className='text-[length:var(--text-12)] font-semibold tracking-[var(--tracking-group)] text-[var(--text-tertiary)] uppercase'>
              {section.title}
            </h3>
            <ul className='space-y-2'>
              {section.rows.map((row) => (
                <li key={row.label} className='flex items-start gap-2.5 text-[length:var(--text-12\\.5)] leading-relaxed'>
                  {(row.keys || row.keyCaps) && (
                    <span className='shrink-0 pt-0.5'>
                      <Kbd combo={row.keys} keys={row.keyCaps} />
                    </span>
                  )}
                  <span className='text-[var(--text-secondary)]'>{row.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
})
