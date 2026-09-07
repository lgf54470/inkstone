import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { PublicNote } from '@shared/types'
import { api, ApiError } from '../../../lib/api'
import { renderMarkdown } from '../../../lib/markdown/renderer'
import { enhancePreview, renderPendingMermaid, resetMermaidNode, toggleCodeBlockCollapse } from '../../../lib/markdown/enhance'
import { moveMarkdownTabFocus, selectMarkdownTab } from '../../preview'
import { useUi } from '../../../store/ui'
import type { UiState } from '../../../store/ui'
import { t, useLocale } from '../../../lib/i18n'


type SharePageCtx = {
    hostRef: MutableRefObject<HTMLDivElement | null>
    dark: boolean
    revisionRef: MutableRefObject<number>
    copyResetTimersRef: MutableRefObject<Map<HTMLElement, number>>
    toast: UiState['toast']
}

export type ShareRenderBundle = ReturnType<typeof useShareRendering>

export function useShareLoad(slug: string) {
    const [note, setNote] = useState<PublicNote | null>(null)
    const [isPasswordRequired, setIsPasswordRequired] = useState(false)
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const requestRef = useRef<AbortController | null>(null)
    const appliedTitleRef = useRef<string | null>(null)
    const originalTitleRef = useRef(document.title)
    const initialReferrerRef = useRef(typeof document !== 'undefined' ? document.referrer : '')
    const ctx = {
        requestRef, setNote, setIsPasswordRequired, setPassword, setError, setIsLoading,
        appliedTitleRef, originalTitleRef, initialReferrerRef,
    }
    const load = useCallback((pwd?: string) => loadShare(slug, pwd, ctx), [slug])
    useEffect(() => {
        setNote(null); setIsPasswordRequired(false); setPassword(''); setError(null)
        void load()
        return () => {
            requestRef.current?.abort()
            requestRef.current = null
            if (appliedTitleRef.current && document.title === appliedTitleRef.current) {
                document.title = originalTitleRef.current
            }
            appliedTitleRef.current = null
        }
    }, [load])
    return { note, isPasswordRequired, password, setPassword, error, isLoading, load }
}

export function useShareRendering(note: PublicNote | null, dark: boolean) {
    const locale = useLocale()
    const toast = useUi((s) => s.toast)
    const hostRef = useRef<HTMLDivElement>(null)
    const revisionRef = useRef(0)
    const copyResetTimersRef = useRef(new Map<HTMLElement, number>())
    const rendered = useMemo(() => {
        if (!note)
            return null
        // Share pages always block external images (no option): visitors never
        // opt in, so third parties cannot track them via note images. The
        // server enforces this too by omitting `https:` from CSP img-src on /s/*.
        const result = renderMarkdown(note.content)
        return {
            ...result,
            html: addShareAccess(result.html, note.share.slug),
        }
    }, [note, locale])
    const htmlObj = useMemo(() => ({ __html: rendered?.html ?? '' }), [rendered])
    useEffect(() => {
        if (!rendered || !hostRef.current)
            return
        const host = hostRef.current
        const revision = ++revisionRef.current
        let isCancelled = false
        const isCurrent = () => !isCancelled && revisionRef.current === revision && hostRef.current === host
        void (async () => {
            await enhancePreview(host, { math: true, mermaid: true, dark, codeBlockCollapseLines: 24 })
            if (!isCurrent())
                return
            await renderPendingMermaid(host, dark, { isCurrent })
        })()
        return () => {
            isCancelled = true
        }
    }, [rendered, dark])
    useEffect(() => () => {
        revisionRef.current++
        for (const timer of copyResetTimersRef.current.values())
            window.clearTimeout(timer)
        copyResetTimersRef.current.clear()
    }, [])
    const ctx = { hostRef, dark, revisionRef, copyResetTimersRef, toast }
    return {
        hostRef, htmlObj,
        onContentClick: (event: React.MouseEvent) => void handleContentClick(event, ctx),
        onContentKeyDown: handleContentKeyDown,
    }
}

type LoadCtx = {
    requestRef: MutableRefObject<AbortController | null>
    setNote: (note: PublicNote | null) => void
    setIsPasswordRequired: (value: boolean) => void
    setPassword: (value: string) => void
    setError: (value: string | null) => void
    setIsLoading: (value: boolean) => void
    appliedTitleRef: MutableRefObject<string | null>
    originalTitleRef: MutableRefObject<string>
    initialReferrerRef: MutableRefObject<string>
}

async function loadShare(slug: string, pwd: string | undefined, ctx: LoadCtx): Promise<void> {
    ctx.requestRef.current?.abort()
    const controller = new AbortController()
    ctx.requestRef.current = controller
    ctx.setIsLoading(true)
    ctx.setError(null)
    try {
        const result = await api.share.read(slug, pwd, controller.signal, ctx.initialReferrerRef.current || undefined)
        if (!controller.signal.aborted) {
            ctx.setNote(result)
            ctx.setIsPasswordRequired(false)
            ctx.setPassword('')
            const title = `${result.title || t("common.untitled_note")} · ${result.site.name}`
            document.title = title
            ctx.appliedTitleRef.current = title
        }
    } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError')
            return
        handleLoadError(err, pwd, ctx)
    } finally {
        if (ctx.requestRef.current === controller) {
            ctx.requestRef.current = null
            ctx.setIsLoading(false)
        }
    }
}

function handleLoadError(err: unknown, pwd: string | undefined, ctx: LoadCtx): void {
    if (err instanceof ApiError && err.status === 401) {
        ctx.setNote(null)
        ctx.setIsPasswordRequired(true)
        if (pwd)
            ctx.setError(t("share.incorrect_passcode"))
    } else {
        ctx.setIsPasswordRequired(false)
        ctx.setError(err instanceof ApiError ? err.message : t("share.content_unavailable"))
    }
}

async function handleContentClick(event: React.MouseEvent, ctx: SharePageCtx): Promise<void> {
    const target = event.target as HTMLElement
    const mermaidRetry = target.closest<HTMLElement>('[data-mermaid-retry]')
    if (mermaidRetry) {
        handleMermaidRetry(mermaidRetry, ctx)
        return
    }
    const copyButton = target.closest<HTMLElement>('[data-copy]')
    if (copyButton) {
        await handleCopyClick(copyButton, ctx)
        return
    }
    const collapseButton = target.closest<HTMLButtonElement>('[data-code-collapse]')
    if (collapseButton) {
        toggleCodeBlockCollapse(collapseButton)
        return
    }
    const tabButton = target.closest<HTMLButtonElement>('[data-tab-button]')
    if (tabButton) {
        event.preventDefault()
        selectMarkdownTab(tabButton)
    }
}

function handleMermaidRetry(button: HTMLElement, ctx: SharePageCtx): void {
    const block = button.closest<HTMLElement>('[data-mermaid]')
    const host = ctx.hostRef.current
    if (!block || !host)
        return
    resetMermaidNode(block)
    const revision = ++ctx.revisionRef.current
    void renderPendingMermaid(host, ctx.dark, {
        isCurrent: () => ctx.revisionRef.current === revision && ctx.hostRef.current === host,
    })
}

async function handleCopyClick(button: HTMLElement, ctx: SharePageCtx): Promise<void> {
    const code = button.closest('.code-block')?.querySelector('pre')?.textContent ?? ''
    if (!navigator.clipboard?.writeText) {
        ctx.toast({ title: t("preview.could_not_copy"), tone: 'danger' })
        return
    }
    try {
        await navigator.clipboard.writeText(code)
        if (!ctx.hostRef.current?.contains(button))
            return
        const existingTimer = ctx.copyResetTimersRef.current.get(button)
        if (existingTimer !== undefined)
            window.clearTimeout(existingTimer)
        button.textContent = t("common.copied")
        button.classList.add('copied')
        const timer = window.setTimeout(() => {
            if (ctx.hostRef.current?.contains(button)) {
                button.textContent = t("common.copy")
                button.classList.remove('copied')
            }
            ctx.copyResetTimersRef.current.delete(button)
        }, 900)
        ctx.copyResetTimersRef.current.set(button, timer)
    } catch {
        ctx.toast({ title: t("preview.could_not_copy"), tone: 'danger' })
    }
}

function handleContentKeyDown(event: React.KeyboardEvent): void {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab-button]')
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        moveMarkdownTabFocus(tab, event.key)
    }
}

function addShareAccess(html: string, slug: string): string {
    const template = document.createElement('template')
    template.innerHTML = html
    for (const embed of template.content.querySelectorAll<HTMLElement>('.note-embed[data-embed-target]')) {
        embed.removeAttribute('data-embed-target')
        embed.classList.remove('isLoading')
        embed.classList.add('error')
        const body = embed.querySelector<HTMLElement>('.note-embed-body')
        if (body) {
            body.removeAttribute('aria-busy')
            body.textContent = t("share.embedded_private_notes_are_not_included_in_public_shares")
        }
    }
    for (const task of template.content.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox')) {
        task.disabled = true
        task.removeAttribute('data-task-line')
        task.setAttribute('aria-label', t("share.tasks_in_public_shares_are_read_only"))
    }
    for (const element of template.content.querySelectorAll<HTMLImageElement | HTMLAnchorElement>('img[src], a[href]')) {
        const attr = element instanceof HTMLImageElement ? 'src' : 'href'
        const raw = element.getAttribute(attr)
        if (!raw)
            continue
        try {
            const url = new URL(raw, window.location.origin)
            if (url.origin !== window.location.origin ||
                !/^\/api\/files\/[0-9a-hjkmnp-tv-z]{26}$/i.test(url.pathname)) {
                continue
            }
            url.searchParams.set('share', slug)
            element.setAttribute(attr, `${url.pathname}${url.search}`)
        }
        catch {
            // Invalid URLs are skipped; the attribute keeps its original value.
        }
    }
    return template.innerHTML
}