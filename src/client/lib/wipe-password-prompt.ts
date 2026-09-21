import { prompt } from '../components/overlay'
import { t } from './i18n'

// Clearing visit logs is unrecoverable, so the endpoint requires the current password
// (SH-12, SH-47 for the blog twin, SH-63 for a single link's history). Every clean entry
// point asks through this single prompt so the title, the input type and the confirm label
// cannot drift between modules; the description is the one part that has to name the scope,
// because "all logs" is the wrong sentence in front of a link-scoped wipe.
export async function promptWipePassword(
  description: string = t('share.verify_password_clear_all'),
): Promise<string | null> {
  return prompt({
    title: t('share.verify_password_title'),
    description,
    type: 'password',
    autoComplete: 'current-password',
    confirmLabel: t('share.clean_now'),
  })
}
