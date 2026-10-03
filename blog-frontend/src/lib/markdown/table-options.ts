/**
 * What a `::: table` container lets the post say about the table it wraps, mirroring
 * the root app's renderer/table-options.ts. A markdown table has no info string of its
 * own, so the container header is where density, stripes and borders are stated.
 */
import { infoFlag, infoOption, infoTokens } from './info-string.ts'

export type TableDensity = 'cozy' | 'compact'
export type TableFrames = 'all' | 'rows' | 'none'

export interface TableOptions {
  density: TableDensity
  zebra: boolean
  frames: TableFrames
}

export const TABLE_OPTION_DEFAULTS: TableOptions = { density: 'cozy', zebra: false, frames: 'all' }

const DENSITIES: Record<string, TableDensity> = { compact: 'compact', tight: 'compact', cozy: 'cozy', comfortable: 'cozy' }
const FRAMES: Record<string, TableFrames> = { all: 'all', box: 'all', rows: 'rows', lines: 'rows', none: 'none', plain: 'none' }

export function parseTableOptions(info: string): TableOptions {
  const options: TableOptions = { ...TABLE_OPTION_DEFAULTS }
  for (const token of infoTokens(info)) {
    const option = infoOption(token)
    const flag = infoFlag(token)
    const density = DENSITIES[option?.key === 'density' ? option.value.toLowerCase() : flag]
    if (density) {
      options.density = density
      continue
    }
    if (option?.key === 'zebra') {
      options.zebra = !/^(false|0|off)$/i.test(option.value)
      continue
    }
    if (flag === 'zebra' || flag === 'striped') {
      options.zebra = true
      continue
    }
    const frames = FRAMES[option?.key === 'frames' ? option.value.toLowerCase() : flag]
    if (frames) options.frames = frames
  }
  return options
}
