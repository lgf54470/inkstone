import { ApiError } from '../../../lib/api';
import { t } from '../../../lib/i18n';

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : t('settings.action_failed_try_again')
}

export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const field = document.createElement('textarea')
  field.value = value
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  try {
    if (!document.execCommand('copy')) throw new Error('copy_failed')
  } finally {
    field.remove()
  }
}
