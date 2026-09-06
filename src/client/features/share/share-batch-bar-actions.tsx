import { FolderClosed } from 'lucide-react'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { confirm, type MenuItem } from '../../components/overlay'
import type { ShareStoreState } from './share-store'

export async function batchEnableAll(batchToggle: ShareStoreState['batchToggle'], noteIds: string[]): Promise<void> {
    await batchToggle('enable', noteIds)
}

export async function batchDisableAll(batchToggle: ShareStoreState['batchToggle'], noteIds: string[]): Promise<void> {
    await batchToggle('disable', noteIds)
}

export async function batchRevokeAll(batchToggle: ShareStoreState['batchToggle'], noteIds: string[], selectedCount: number): Promise<void> {
    const ok = await confirm({
        title: t('share.batch_revoke_title', { count: selectedCount }),
        description: t('share.batch_revoke_confirm'),
        confirmLabel: t('share.revoke_link'),
        tone: 'danger',
    })
    if (!ok) return
    await batchToggle('revoke', noteIds)
}

export async function batchSetExpiry(batchToggle: ShareStoreState['batchToggle'], noteIds: string[], millis: number | null): Promise<void> {
    await batchToggle('expire', noteIds, millis)
}

export function buildExpiryMenuItems(batchToggle: ShareStoreState['batchToggle'], noteIds: string[]): MenuItem[] {
    return [
        { id: 'perm', label: t('share.never_expires'), onSelect: () => void batchSetExpiry(batchToggle, noteIds, null) },
        { id: '1d', label: t('share.1_day'), onSelect: () => void batchSetExpiry(batchToggle, noteIds, 24 * 3600000) },
        { id: '7d', label: t('share.7_days'), onSelect: () => void batchSetExpiry(batchToggle, noteIds, 7 * 24 * 3600000) },
        { id: '30d', label: t('share.30_days'), onSelect: () => void batchSetExpiry(batchToggle, noteIds, 30 * 24 * 3600000) },
    ]
}

export function buildShareFolderMenuItems(
    folders: ShareStoreState['folders'],
    noteIds: string[],
    batchMoveToFolder: ShareStoreState['batchMoveToFolder'],
    selectedCount: number,
    closeMenu: () => void,
    toast: UiState['toast'],
): MenuItem[] {
    return [
        {
            id: 'root',
            label: t('share.no_folder'),
            icon: <FolderClosed size={13} className="text-[var(--text-quaternary)]" />,
            onSelect: async () => {
                closeMenu()
                const ok = await batchMoveToFolder(noteIds, null)
                if (ok) {
                    toast({ title: t('share.batch_move_success', { count: selectedCount }), tone: 'success' })
                }
            },
        },
        ...folders.map((f) => ({
            id: f.id,
            label: f.name,
            icon: (
                <span style={{ color: f.color ?? undefined }} className="shrink-0">
                    <FolderClosed size={13} />
                </span>
            ),
            onSelect: async () => {
                closeMenu()
                const ok = await batchMoveToFolder(noteIds, f.id)
                if (ok) {
                    toast({ title: t('share.batch_move_success', { count: selectedCount }), tone: 'success' })
                }
            },
        })),
    ]
}