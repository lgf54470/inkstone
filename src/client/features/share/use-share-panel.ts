import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { NoteSummary, ShareInfo } from '@shared/types'
import { api, ApiError } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { useRelativeTime } from '../../lib/hooks'
import { confirm } from '../../components/overlay'
import { useUi } from '../../store/ui'
import type { UiState } from '../../store/ui'
import { useActiveNote } from '../../store/notes/selectors'
import { t } from '../../lib/i18n'
import { expiresInForSelection, KEEP_CURRENT_EXPIRY, needsNewSharePasscode } from './share-form'

export type SharePanelCtx = {
    noteIdRef: MutableRefObject<string | null>
    mutationEpoch: MutableRefObject<number>
    loadEpoch: MutableRefObject<number>
    busyRef: MutableRefObject<'save' | 'revoke' | null>
    copiedTimer: MutableRefObject<number>
    loadError: string | null
    setShare: (share: ShareInfo | null | undefined) => void
    setLoadError: (error: string | null) => void
    setBusy: (busy: 'save' | 'revoke' | null) => void
    toast: UiState['toast']
}

export type SharePanelForm = {
    setPassword: (value: string) => void
    setShouldUsePassword: (value: boolean) => void
    setExpiry: (value: string) => void
    setIsCopied: (value: boolean) => void
}

export function useSharePanelData(onClose: () => void) {
    const { note } = useActiveNote()
    const toast = useUi((s) => s.toast)
    const [share, setShare] = useState<ShareInfo | null | undefined>(undefined)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reload, setReload] = useState(0)
    const [busy, setBusy] = useState<'save' | 'revoke' | null>(null)
    const copiedTimer = useRef(0)
    const busyRef = useRef<'save' | 'revoke' | null>(null)
    const noteIdRef = useRef<string | null>(note?.id ?? null)
    const mutationEpoch = useRef(0)
    const loadEpoch = useRef(0)
    noteIdRef.current = note?.id ?? null
    const ctx: SharePanelCtx = {
        noteIdRef, mutationEpoch, loadEpoch, busyRef, copiedTimer, loadError,
        setShare, setLoadError, setBusy, toast,
    }
    useEffect(() => {
        const epoch = ++loadEpoch.current
        mutationEpoch.current++
        busyRef.current = null
        setBusy(null)
        if (!note) { setShare(undefined); return }
        const controller = new AbortController()
        setShare(undefined); setLoadError(null)
        window.clearTimeout(copiedTimer.current)
        void fetchShareStatus(note.id, controller.signal, epoch, ctx)
        return () => controller.abort()
    }, [note?.id, reload])
    useEffect(() => () => {
        noteIdRef.current = null
        loadEpoch.current++
        mutationEpoch.current++
        busyRef.current = null
        window.clearTimeout(copiedTimer.current)
    }, [])
    return { note, share, loadError, reload, setReload, busy, ctx, onClose }
}

export function useSharePanelForm(bundle: ReturnType<typeof useSharePanelData>) {
    const { note, share, reload, ctx } = bundle
    const [password, setPassword] = useState('')
    const [shouldUsePassword, setShouldUsePassword] = useState(false)
    const [expiry, setExpiry] = useState('0')
    const [isCopied, setIsCopied] = useState(false)
    const createdTime = useRelativeTime(share?.createdAt ?? 0, Boolean(share))
    useEffect(() => {
        setPassword('')
        setShouldUsePassword(false)
        setExpiry('0')
        setIsCopied(false)
    }, [note?.id, reload])
    const form: SharePanelForm = { setPassword, setShouldUsePassword, setExpiry, setIsCopied }
    const create = () => createShareFlow({ note, share, shouldUsePassword, password, expiry, form, ctx })
    const revoke = () => revokeShareFlow({ note, share, shouldUsePassword, expiry, form, ctx })
    const copy = () => copyShareLink({ note, share, form, ctx })
    return { password, setPassword, shouldUsePassword, setShouldUsePassword, expiry, setExpiry, isCopied, createdTime, create, revoke, copy }
}

type SharePanelFlow = {
    note: NoteSummary | null
    share: ShareInfo | null | undefined
    shouldUsePassword: boolean
    password: string
    expiry: string
    form: SharePanelForm
    ctx: SharePanelCtx
}

async function fetchShareStatus(noteId: string, signal: AbortSignal, epoch: number, ctx: SharePanelCtx): Promise<void> {
    try {
        const res = await api.share.get(noteId, signal)
        if (signal.aborted || ctx.loadEpoch.current !== epoch || ctx.noteIdRef.current !== noteId) return
        ctx.setShare(res.share)
        ctx.setLoadError(null)
    } catch (error) {
        if (!signal.aborted && ctx.loadEpoch.current === epoch && ctx.noteIdRef.current === noteId) {
            ctx.setLoadError(errorMessage(error))
        }
    }
}

async function createShareFlow({ note, share, shouldUsePassword, password, expiry, form, ctx }: SharePanelFlow): Promise<void> {
    if (!note || ctx.busyRef.current || share === undefined || ctx.loadError) return
    if (shouldUsePassword && password.length > 0 && password.length < 4) {
        ctx.toast({ title: t("share.passcode_too_short"), tone: 'danger' })
        return
    }
    if (needsNewSharePasscode(shouldUsePassword, Boolean(share?.hasPassword), password)) {
        ctx.toast({ title: t("share.enter_a_passcode"), tone: 'danger' })
        return
    }
    const noteId = note.id
    const epoch = ++ctx.mutationEpoch.current
    ctx.loadEpoch.current++
    const wasShared = Boolean(share)
    ctx.busyRef.current = 'save'
    ctx.setBusy('save')
    try {
        const res = await api.share.create(noteId, {
            password: shouldUsePassword ? password || undefined : null,
            expiresIn: expiresInForSelection(expiry),
        })
        if (ctx.mutationEpoch.current !== epoch || ctx.noteIdRef.current !== noteId) return
        ctx.setShare(res.share)
        form.setPassword('')
        form.setExpiry(res.share.expiresAt ? KEEP_CURRENT_EXPIRY : '0')
        ctx.toast({ title: wasShared ? t("share.sharing_settings_updated") : t("share.public_link_created"), tone: 'success' })
    } catch (err) {
        if (ctx.mutationEpoch.current !== epoch || ctx.noteIdRef.current !== noteId) return
        ctx.toast({ title: t("common.action_failed"), description: err instanceof ApiError ? err.message : String(err), tone: 'danger' })
    } finally {
        if (ctx.mutationEpoch.current === epoch && ctx.noteIdRef.current === noteId) {
            ctx.busyRef.current = null
            ctx.setBusy(null)
        }
    }
}

async function revokeShareFlow({ note, share, shouldUsePassword, expiry, form, ctx }: Omit<SharePanelFlow, 'password'>): Promise<void> {
    if (!note || ctx.busyRef.current) return
    const noteId = note.id
    const epoch = ++ctx.mutationEpoch.current
    const previousShare = share
    const previousUsePassword = shouldUsePassword
    const previousExpiry = expiry
    ctx.loadEpoch.current++
    ctx.busyRef.current = 'revoke'
    ctx.setBusy('revoke')
    try {
        const ok = await confirm({
            title: t("share.revoke_this_public_link"),
            description: t("share.anyone_who_gets_the_link_will_immediately_lose_access"),
            confirmLabel: t("share.revoke_link"),
            tone: 'danger',
        })
        if (ctx.mutationEpoch.current !== epoch || ctx.noteIdRef.current !== noteId || !ok) return
        ctx.setShare(null)
        form.setShouldUsePassword(false)
        form.setExpiry('0')
        await api.share.remove(noteId)
        if (ctx.mutationEpoch.current !== epoch || ctx.noteIdRef.current !== noteId) return
        ctx.toast({ title: t("share.link_revoked") })
    } catch (err) {
        if (ctx.mutationEpoch.current !== epoch || ctx.noteIdRef.current !== noteId) return
        ctx.setShare(previousShare)
        form.setShouldUsePassword(previousUsePassword)
        form.setExpiry(previousExpiry)
        ctx.toast({ title: t("common.action_failed"), description: err instanceof ApiError ? err.message : String(err), tone: 'danger' })
    } finally {
        if (ctx.mutationEpoch.current === epoch && ctx.noteIdRef.current === noteId) {
            ctx.busyRef.current = null
            ctx.setBusy(null)
        }
    }
}

async function copyShareLink({ note, share, form, ctx }: Pick<SharePanelFlow, 'note' | 'share' | 'form' | 'ctx'>): Promise<void> {
    if (!note || !share) return
    const noteId = note.id
    try {
        await navigator.clipboard.writeText(share.url)
        if (ctx.noteIdRef.current !== noteId) return
        form.setIsCopied(true)
        window.clearTimeout(ctx.copiedTimer.current)
        ctx.copiedTimer.current = window.setTimeout(() => form.setIsCopied(false), 1400)
    } catch {
        if (ctx.noteIdRef.current !== noteId) return
        ctx.toast({ title: t("preview.could_not_copy"), tone: 'danger' })
    }
}