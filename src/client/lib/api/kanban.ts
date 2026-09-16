import type { KanbanFile } from '../markdown/kanban/types'
import { request } from './transport'

export async function uploadKanbanFile(
  file: File,
  kanbanName = 'default',
  signal?: AbortSignal,
): Promise<KanbanFile> {
  const form = new FormData()
  form.append('file', file)
  form.append('kanbanName', kanbanName)

  return request<KanbanFile>('/api/kanban/upload', {
    method: 'POST',
    formData: form,
    signal,
  })
}

export async function deleteKanbanFile(
  kanbanName: string,
  filename: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/kanban/file/${encodeURIComponent(kanbanName)}/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    signal,
  })
}
