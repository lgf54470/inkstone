import { Check, Copy, ExternalLink, Eye, Globe, Link2, Lock, Trash2 } from 'lucide-react'
import { LIMITS } from '@shared/constants'
import type { ShareInfo } from '@shared/types'
import { cn } from '../../lib/cn'
import { fullTime } from '../../lib/time'
import { Badge, Button } from '../../components/primitives'
import { Field, Input, Segmented, Switch } from '../../components/form'
import { Modal, Tooltip } from '../../components/overlay'
import { Empty, LoadingBlock } from '../../components/feedback'
import { t } from '../../lib/i18n'
import { KEEP_CURRENT_EXPIRY } from './share-form'
import { useSharePanelData, useSharePanelForm } from './use-share-panel'

const EXPIRY_OPTIONS = [
    { value: '0', label: () => t("share.never_expires") },
    { value: String(24 * 3600000), label: () => t("share.1_day") },
    { value: String(7 * 24 * 3600000), label: () => t("share.7_days") },
    { value: String(30 * 24 * 3600000), label: () => t("share.30_days") },
]

type PanelProps = {
    data: ReturnType<typeof useSharePanelData>
    form: ReturnType<typeof useSharePanelForm>
}

export function SharePanel({ onClose }: {
    onClose: () => void;
}) {
    const data = useSharePanelData(onClose)
    const form = useSharePanelForm(data)
    const { note } = data
    if (!note)
        return null
    return (
        <Modal
            open
            onClose={onClose}
            title={t("share.share_note")}
            description={`"${note.title || t("common.untitled_note")}"`}
            width={480}
            footer={<SharePanelFooter data={data} form={form} />}
        >
            <SharePanelBody data={data} form={form} />
        </Modal>
    );
}

function SharePanelFooter({ data, form }: PanelProps) {
    const { share, busy, onClose } = data
    if (!share) {
        return (
            <>
                <Button variant="ghost" disabled={busy !== null} onClick={onClose}>{t("common.cancel")}</Button>
                <Button variant="primary" icon={<Globe size={13}/>} loading={busy === 'save'} disabled={share === undefined || busy !== null} onClick={() => void form.create()}>{t("share.generate_public_link")}</Button>
            </>
        )
    }
    return (
        <>
            <Button variant="ghost" className="mr-auto text-[var(--danger)]" icon={<Trash2 size={13}/>} loading={busy === 'revoke'} disabled={busy === 'save'} onClick={() => void form.revoke()}>{t("share.revoke_link")}</Button>
            <Button variant="secondary" disabled={busy !== null} onClick={onClose}>{t("share.done")}</Button>
            <Button variant="primary" loading={busy === 'save'} disabled={busy === 'revoke'} onClick={() => void form.create()}>{t("share.update_settings")}</Button>
        </>
    )
}

function SharePanelBody({ data, form }: PanelProps) {
    const { loadError, setReload, share } = data
    if (loadError) {
        return (
            <Empty
                art="notes"
                compact
                title={t("share.could_not_load_sharing_status")}
                description={loadError}
                action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>{t("common.retry")}</Button>}
            />
        )
    }
    if (share === undefined)
        return <LoadingBlock label={t("share.loading_share_status")}/>
    return (
        <div className="space-y-4">
            {share && <ShareLinkCard data={data} form={form} />}
            <SharePasscodeSection data={data} form={form} />
            {form.shouldUsePassword && <SharePasscodeField data={data} form={form} />}
            <ShareExpiryField data={data} form={form} />
            <p className="rounded-[var(--r-md)] bg-[var(--bg-inset)] px-3 py-2.5 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">{t("share.public_links_are_read_only_visitors_can_see_only_the_latest_version_of_t")}</p>
        </div>
    )
}

function ShareLinkCard({ data, form }: PanelProps) {
    const { share } = data
    if (!share)
        return null
    return (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3">
            <div className="flex items-center gap-2">
                <Link2 size={13} className="shrink-0 text-[var(--accent)]"/>
                <input aria-label={t("share.public_link")} readOnly value={share.url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent font-mono text-[length:var(--text-11\.5)] text-[var(--text-secondary)] focus:outline-none"/>
                <Button size="sm" variant={form.isCopied ? 'ghost' : 'secondary'} icon={form.isCopied ? <Check size={12} className="text-[var(--success)]"/> : <Copy size={12}/>} onClick={() => void form.copy()}>
                    {form.isCopied ? t("common.copied") : t("common.copy")}
                </Button>
                <Tooltip label={t("share.open_link")} side="left">
                    <a href={share.url} target="_blank" rel="noreferrer" aria-label={t("share.open_link")} className="inline-flex size-9 items-center justify-center rounded-[var(--r-md)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] md:size-7">
                        <ExternalLink size={13}/>
                    </a>
                </Tooltip>
            </div>
            <ShareLinkMeta share={share} createdTime={form.createdTime} />
        </div>
    )
}

function ShareLinkMeta({ share, createdTime }: {
    share: ShareInfo
    createdTime: string
}) {
    return (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-2.5 text-[length:var(--text-11)] text-[var(--text-quaternary)]">
            <span className="flex items-center gap-1">
                <Eye size={11}/>
                {share.views}{t("share.visits")}</span>
            {share.hasPassword && <Badge tone="warning">{t("share.passcode_protected")}</Badge>}
            {share.expiresAt ? (
                <span className={cn(share.expiresAt < Date.now() && 'text-[var(--danger)]')}>
                    {share.expiresAt < Date.now()
                        ? t("share.expired") : t("share.expires_value0", { value0: fullTime(share.expiresAt) })}
                </span>
            ) : (
                <span>{t("share.never_expires_71ab34")}</span>
            )}
            <span className="ml-auto">{t("common.created")}{createdTime}</span>
        </div>
    )
}

function SharePasscodeSection({ data, form }: PanelProps) {
    const { busy } = data
    return (
        <div className="flex items-center justify-between gap-4 py-1">
            <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[length:var(--text-13)] font-medium">
                    <Lock size={12} className="text-[var(--text-tertiary)]"/>{t("common.access_passcode")}</div>
                <p className="mt-0.5 text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">{t("share.require_a_passcode_to_view_this_note")}</p>
            </div>
            <Switch checked={form.shouldUsePassword} disabled={busy !== null} onChange={form.setShouldUsePassword} label={t("common.access_passcode")}/>
        </div>
    )
}

function SharePasscodeField({ data, form }: PanelProps) {
    const { share, busy } = data
    return (
        <Field label={t("share.passcode")} hint={share?.hasPassword ? t("share.leave_blank_to_keep_the_current_passcode") : undefined}>
            <Input type="password" value={form.password} disabled={busy !== null} maxLength={LIMITS.passwordMaxLength} onChange={(e) => form.setPassword(e.target.value)} placeholder={share?.hasPassword ? t("share.unchanged") : t("share.set_a_passcode")} autoComplete="new-password"/>
        </Field>
    )
}

function ShareExpiryField({ data, form }: PanelProps) {
    const { share, busy } = data
    const options = [
        ...(share?.expiresAt ? [{ value: KEEP_CURRENT_EXPIRY, label: t("share.keep_current_expiration") }] : []),
        ...EXPIRY_OPTIONS.map((option) => ({
            ...option,
            label: option.label(),
        })),
    ]
    return (
        <Field label={t("share.expiration")}>
            <Segmented value={form.expiry} disabled={busy !== null} onChange={form.setExpiry} options={options}/>
        </Field>
    )
}