import { ApiError } from '../../lib/api'
import { t, translateApiError, type MessageKey } from '../../lib/i18n'
import { useUi } from '../../store/ui'

export function musicErrorMessage(error: unknown, fallbackKey: MessageKey): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return t(fallbackKey)
}

export function toastMusic(titleKey: MessageKey, params?: Record<string, string | number>): void {
  useUi.getState().toast({ title: t(titleKey, params), tone: 'success' })
}

export function toastMusicNotice(titleKey: MessageKey): void {
  useUi.getState().toast({ title: t(titleKey), tone: 'warning' })
}

export function toastMusicError(error: unknown, fallbackKey: MessageKey): void {
  useUi.getState().toast({ title: musicErrorMessage(error, fallbackKey), tone: 'danger' })
}

export function toastUploadError(code: string | null): void {
  const fallback = t('music.upload_failed')
  useUi.getState().toast({ title: translateApiError(code ?? 'unknown', fallback), tone: 'danger' })
}
