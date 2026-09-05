import type { McpWriteContext } from '.././writes';

export interface LibraryContext extends McpWriteContext {
  origin: string
}

export interface FolderRow {
  id: string
  parent_id: string | null
  name: string
  icon: string | null
  color: string | null
  position: number
  created_at: number
  updated_at: number
}
