export function normalizeCalloutType(val: string): string {
  const type = val.toLowerCase()
  const aliases: Record<string, string> = {
    summary: 'abstract',
    tldr: 'abstract',
    hint: 'tip',
    important: 'tip',
    check: 'success',
    done: 'success',
    help: 'question',
    faq: 'question',
    caution: 'warning',
    attention: 'warning',
    fail: 'failure',
    missing: 'failure',
    error: 'danger',
    bug: 'danger',
    cite: 'quote',
  }
  return (aliases[type] ?? type.replace(/[^a-z0-9_-]/g, '')) || 'note'
}

export function calloutDefaultTitle(type: string): string {
  const map: Record<string, string> = {
    note: '核心提示 (Note)',
    abstract: '内容摘要 (Abstract)',
    info: '关键信息 (Info)',
    todo: '任务清单 (Todo)',
    tip: '实用技巧 (Tip)',
    success: '成功完成 (Success)',
    question: '疑问待定 (Question)',
    warning: '注意事项 (Warning)',
    failure: '执行失败 (Failure)',
    danger: '危险警示 (Danger)',
    caution: '风险预警 (Caution)',
    example: '演示示例 (Example)',
    quote: '引述内容 (Quote)',
    important: '重要规范 (Important)',
  }
  return map[type] ?? type.toUpperCase()
}