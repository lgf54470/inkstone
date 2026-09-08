import { CLIENT_HEADER } from '@shared/constants'
import { secureRandomId } from '../id'
import { publishBroadcast } from '../db'
import { getLocale, t, translateApiError } from '../i18n'



export const CLIENT_ID = secureRandomId()


/**
 * Client-side ApiError (consumer of the HTTP boundary). Deliberately mirrors
 * the worker's ApiError (src/worker/lib/errors.ts) without sharing the class:
 * the two layers must stay import-decoupled, and the client carries extra
 * client-only states (offline/timeout) that have no server counterpart.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isOffline(): boolean {
    return this.status === 0
  }
  get isAuth(): boolean {
    return this.status === 401
  }
  get isConflict(): boolean {
    return this.status === 409
  }
}



interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
  formData?: FormData
  timeoutMs?: number
}


interface RequestTimeout {
  controller: AbortController
  hasTimedOut: boolean
  handle: number
  detachCallerSignal: (() => void) | undefined
}

function buildRequestPayload(options: RequestOptions): { headers: Record<string, string>; payload: BodyInit | undefined } {
  const headers: Record<string, string> = {
    [CLIENT_HEADER]: '1',
    'X-Inkstone-Origin': CLIENT_ID,
    'Accept-Language': getLocale(),
  }
  let payload: BodyInit | undefined
  if (options.formData) {
    payload = options.formData
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(options.body)
  }
  return { headers, payload }
}

function setupRequestTimeout(signal: AbortSignal | undefined, timeoutMs: number | undefined): RequestTimeout | null {
  if (!timeoutMs || timeoutMs <= 0) return null
  const timeout: RequestTimeout = {
    controller: new AbortController(),
    hasTimedOut: false,
    handle: 0,
    detachCallerSignal: undefined,
  }
  const abortFromCaller = () => timeout.controller.abort(signal?.reason)
  if (signal?.aborted) abortFromCaller()
  else if (signal) {
    signal.addEventListener('abort', abortFromCaller, { once: true })
    timeout.detachCallerSignal = () => signal.removeEventListener('abort', abortFromCaller)
  }
  timeout.handle = window.setTimeout(() => {
    timeout.hasTimedOut = true
    timeout.controller.abort()
  }, timeoutMs)
  return timeout
}

async function readResponseBody(response: Response, isJson: boolean): Promise<{ data: unknown; isInvalidJson: boolean }> {
  if (!isJson) return { data: null, isInvalidJson: false }
  const raw = await response.text()
  if (!raw.trim()) return { data: null, isInvalidJson: false }
  try {
    return { data: JSON.parse(raw), isInvalidJson: false }
  } catch {
    return { data: null, isInvalidJson: true }
  }
}

function responseApiError(response: Response, data: unknown): ApiError {
  const error = (data as { error?: { code: string; message: string; details?: unknown } } | null)?.error
  const code = error?.code ?? 'unknown'
  const fallback = error?.message ?? t('api.request_failed_status', { status: response.status })
  return new ApiError(
    response.status,
    code,
    translateApiError(code, fallback),
    error?.details,
  )
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', signal, timeoutMs } = options
  const { headers, payload } = buildRequestPayload(options)
  const timeout = setupRequestTimeout(signal, timeoutMs)

  try {
    const response = await fetch(path, {
      method,
      headers,
      body: payload,
      signal: timeout?.controller.signal ?? signal,
      credentials: 'same-origin',
    })

    const notifyOtherTabs = method !== 'GET' && shouldNotifyOtherTabs(path)
    if (response.status === 204) {
      if (notifyOtherTabs) publishBroadcast({ type: 'local-write', clientId: CLIENT_ID })
      return undefined as T
    }

    const isJson = isJsonResponse(response)
    const { data, isInvalidJson } = await readResponseBody(response, isJson)
    if (!response.ok) throw responseApiError(response, data)
    if (isInvalidJson) {
      throw new ApiError(502, 'invalid_response', t('api.invalid_server_response'))
    }
    if (notifyOtherTabs) {
      publishBroadcast({ type: 'local-write', clientId: CLIENT_ID })
    }
    return (isJson ? data : await response.text()) as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (timeout?.hasTimedOut) throw new ApiError(0, 'request_timeout', t('api.request_timed_out'))
    if ((err as Error)?.name === 'AbortError') throw err
    throw new ApiError(0, 'offline', t('api.no_network_connection'))
  } finally {
    if (timeout?.handle) window.clearTimeout(timeout.handle)
    timeout?.detachCallerSignal?.()
  }
}



function isJsonResponse(response: Response): boolean {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'application/json' || Boolean(mediaType?.endsWith('+json'))
}



async function fetchDownload(path: string, fallbackName: string): Promise<{ response: Response; filename: string }> {
  let response: Response
  try {
    response = await fetch(path, {
      headers: {
        [CLIENT_HEADER]: '1',
        'X-Inkstone-Origin': CLIENT_ID,
        'Accept-Language': getLocale(),
      },
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'offline', t('api.no_network_connection'))
  }

  if (!response.ok) {
    const data = isJsonResponse(response)
      ? await response.json().catch(() => null)
      : null
    const error = (data as { error?: { code: string; message: string; details?: unknown } } | null)?.error
    const code = error?.code ?? 'unknown'
    const fallback = error?.message ?? t('api.request_failed_status', { status: response.status })
    throw new ApiError(
      response.status,
      code,
      translateApiError(code, fallback),
      error?.details,
    )
  }

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"\r\n]+)"/i.exec(disposition)?.[1] ?? fallbackName
  return { response, filename }
}


async function saveZipToPicker(): Promise<boolean> {
  const picker = (window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string
      types: Array<{ description: string; accept: Record<string, string[]> }>
    }) => Promise<FileSystemFileHandle>
  }).showSaveFilePicker
  if (!picker) return false
  let handle: FileSystemFileHandle
  try {
    handle = await picker.call(window, {
      suggestedName: `inkstone-backup-${new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 15)}.zip`,
      types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return true
    throw error
  }
  const { response } = await fetchDownload('/api/export?format=zip', 'inkstone-backup.zip')
  if (!response.body) throw new ApiError(0, 'unknown', t('api.no_network_connection'))
  const writable = await handle.createWritable()
  await response.body.pipeTo(writable)
  return true
}

export async function saveDownload(format: 'json' | 'zip'): Promise<void> {
  if (format === 'zip') {
    if (await saveZipToPicker()) return
    const { response, filename } = await fetchDownload('/api/export?format=zip', 'inkstone-backup.zip')
    await saveResponseDownload(response, filename)
    return
  }

  const { response, filename } = await fetchDownload('/api/export?format=json', 'inkstone-export.json')
  await saveResponseDownload(response, filename)
}



async function saveResponseDownload(response: Response, filename: string): Promise<void> {
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}



function shouldNotifyOtherTabs(path: string): boolean {
  return /^\/api\/(?:notes(?:\/|$)|folders(?:\/|$)|tags(?:\/|$)|import(?:\?|$))/.test(path)
}


export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (!entries.length) return ''
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}`
}
