import { useEffect, useMemo, useState } from 'react'
import { COPY_FEEDBACK_MS } from '@shared/constants'
import { errorMessage } from '../../../lib/errors'
import { renderMarkdown } from '../../../lib/markdown/renderer'
import { IMAGE_EXTENSIONS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, MARKDOWN_EXTENSIONS, CSV_EXTENSIONS, CODE_EXTENSIONS, TEXT_DATA_EXTENSIONS } from './extensions'
import { getExtension, parseCsvToRows } from './utils'
import type { FilePreviewModalProps } from './types'

const ZOOM_STEP = 0.25
const ZOOM_MIN = 0.25
const ZOOM_MAX = 3

function renderMarkdownSafe(isMarkdown: boolean, textContent: string | null) {
  if (!isMarkdown || !textContent) return ''
  try {
    return renderMarkdown(textContent, { externalImages: true }).html
  } catch {
    return ''
  }
}

function parseCsvRowsSafe(isCsv: boolean, textContent: string | null, ext: string) {
  if (!isCsv || !textContent) return []
  return parseCsvToRows(textContent, ext === 'tsv' ? '\t' : ',')
}

function classifyFile(ext: string) {
  return {
    isImage: IMAGE_EXTENSIONS.has(ext),
    isPdf: ext === 'pdf',
    isAudio: AUDIO_EXTENSIONS.has(ext),
    isVideo: VIDEO_EXTENSIONS.has(ext),
    isMarkdown: MARKDOWN_EXTENSIONS.has(ext),
    isCsv: CSV_EXTENSIONS.has(ext),
    isCode: CODE_EXTENSIONS.has(ext),
    isTextData: TEXT_DATA_EXTENSIONS.has(ext),
  }
}

function useTextPreviewState(open: boolean, url: string, enabled: boolean) {
  const [textContent, setTextContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setTextContent(null)
      setError(null)
      setIsLoading(false)
      return
    }
    if (!enabled) return

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const text = await res.text()
        setTextContent(text)
        setIsLoading(false)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(errorMessage(err))
        setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [open, url, enabled])

  return { textContent, isLoading, error }
}

function useImagePreviewState(open: boolean, enabled: boolean) {
  const [imageScale, setImageScale] = useState(1)
  const [imageRotation, setImageRotation] = useState(0)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [isImageLoading, setIsImageLoading] = useState(true)
  const [isImageError, setIsImageError] = useState(false)

  useEffect(() => {
    if (!open) {
      setImageScale(1)
      setImageRotation(0)
      setNaturalSize(null)
      setIsImageLoading(true)
      setIsImageError(false)
      return
    }
    if (!enabled) return
    setIsImageLoading(true)
    setIsImageError(false)
    setImageScale(1)
    setImageRotation(0)
  }, [open, enabled])

  const handleZoomIn = () => setImageScale((prev) => Math.min(prev + ZOOM_STEP, ZOOM_MAX))
  const handleZoomOut = () => setImageScale((prev) => Math.max(prev - ZOOM_STEP, ZOOM_MIN))
  const handleZoomReset = () => {
    setImageScale(1)
    setImageRotation(0)
  }
  const handleRotate = () => setImageRotation((prev) => (prev + 90) % 360)

  return {
    imageScale,
    imageRotation,
    naturalSize,
    isImageLoading,
    isImageError,
    setNaturalSize,
    setIsImageLoading,
    setIsImageError,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleRotate,
  }
}

export function useFilePreview({ open, url, filename }: Pick<FilePreviewModalProps, 'open' | 'url' | 'filename'>) {
  const ext = getExtension(filename)
  const kind = classifyFile(ext)
  const isText = kind.isMarkdown || kind.isCsv || kind.isCode || kind.isTextData

  const { textContent, isLoading, error } = useTextPreviewState(open, url, isText)
  const image = useImagePreviewState(open, kind.isImage)

  const [isCopied, setIsCopied] = useState(false)
  const [textMode, setTextMode] = useState<'rendered' | 'source' | 'table'>('rendered')

  useEffect(() => {
    if (!open) setTextMode('rendered')
  }, [open])

  const previewUrl = `${url}?preview=1`

  const renderedMarkdown = useMemo(() => renderMarkdownSafe(kind.isMarkdown, textContent), [kind.isMarkdown, textContent])
  const csvRows = useMemo(() => parseCsvRowsSafe(kind.isCsv, textContent, ext), [kind.isCsv, textContent, ext])

  const handleCopyText = async () => {
    if (!textContent) return
    try {
      await navigator.clipboard.writeText(textContent)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS)
    } catch (err) {
      console.warn('[preview] failed to copy text', err)
    }
  }

  return {
    ...kind,
    isText,
    ext,
    filename,
    url,
    previewUrl,
    textContent,
    isLoading,
    error,
    isCopied,
    textMode,
    setTextMode,
    handleCopyText,
    renderedMarkdown,
    csvRows,
    ...image,
  }
}

export type FilePreviewBundle = ReturnType<typeof useFilePreview>