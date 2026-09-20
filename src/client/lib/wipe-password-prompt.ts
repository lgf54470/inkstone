import { prompt } from '../components/overlay'
import { t } from './i18n'

// Clearing every visit log is unrecoverable, so the endpoint requires the current
// password (SH-12, and SH-47 for the blog twin). Every clean entry point asks
// through this single prompt so the wording cannot drift between the two modules.
export async function promptWipePassword(): Promise<string | null> {
  return prompt({
    title: t('share.verify_password_title'),
    description: t('share.verify_password_clear_all'),
    type: 'password',
    autoComplete: 'current-password',
    confirmLabel: t('share.clean_now'),
  })
}
