import type { AttachmentWithUsage } from '@shared/types'
import { AttachmentDriveModal } from './AttachmentDriveModal'

export function AttachmentManager({
  open,
  onClose,
  onChanged,
  onInsertFile,
}: {
  open: boolean
  onClose: () => void
  onChanged?: () => void
  onInsertFile?: (file: AttachmentWithUsage) => void
}) {
  return (
    <AttachmentDriveModal
      open={open}
      onClose={() => {
        onClose()
        onChanged?.()
      }}
      onInsertFile={onInsertFile}
    />
  )
}

export { AttachmentDriveModal }
