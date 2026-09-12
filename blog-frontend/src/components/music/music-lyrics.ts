export interface LyricLine {
  timeMs: number
  text: string
}

const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/** 博客前台只展示当前与下一句歌词，解析保持最小实现 */
export function parseLyric(raw: string | null | undefined): LyricLine[] {
  if (!raw) return []
  const lines: LyricLine[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const text = rawLine.replace(LRC_TIME, '').trim()
    LRC_TIME.lastIndex = 0
    const match = LRC_TIME.exec(rawLine)
    if (!text || !match) continue
    let cursor: RegExpExecArray | null = match
    while (cursor) {
      lines.push({ timeMs: timestampOf(cursor[1] ?? '0', cursor[2] ?? '0', cursor[3]), text })
      cursor = LRC_TIME.exec(rawLine)
    }
    LRC_TIME.lastIndex = 0
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

export function activeLyricIndex(lines: LyricLine[], timeMs: number): number {
  let low = 0
  let high = lines.length - 1
  let answer = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if ((lines[mid]?.timeMs ?? 0) <= timeMs) {
      answer = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return answer
}

export function activeLyricWindow(lines: LyricLine[], timeMs: number): { current: string | null; next: string | null } {
  if (!lines.length) return { current: null, next: null }
  const index = Math.max(0, activeLyricIndex(lines, timeMs))
  return { current: lines[index]?.text ?? null, next: lines[index + 1]?.text ?? null }
}

function timestampOf(minutes: string, seconds: string, fraction: string | undefined): number {
  const ms = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + ms
}
