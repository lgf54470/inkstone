/**
 * 分页页码序列：总数 ≤ 7 时全部展示；否则首尾页 + 当前页±1 窗口，
 * 窗口与首尾之间的缺口用单个 '...' 占位（窗口会收敛到 [2, totalPages-1]）。
 */
export function buildPageItems(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const windowStart = Math.max(2, currentPage - 1)
  const windowEnd = Math.min(totalPages - 1, currentPage + 1)
  const pages: (number | '...')[] = [1]
  if (windowStart > 2) pages.push('...')
  for (let i = windowStart; i <= windowEnd; i++) pages.push(i)
  if (windowEnd < totalPages - 1) pages.push('...')
  pages.push(totalPages)
  return pages
}

/** 解析正整数查询参数：非法输入回退默认值，避免 NaN 进请求 */
export function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed
}

/** 页码到 URL：第 1 页省略查询参数，已带查询串的 baseUrl 用 & 拼接 */
export function getPageUrl(page: number, baseUrl = ''): string {
  if (page === 1) return baseUrl || '/'
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}page=${page}`
}