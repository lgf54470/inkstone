export function formatCode(code: string, language: string, tabSize = 2): string {
  const lang = (language || '').toLowerCase().trim();
  const trimmed = code.trim();
  if (!trimmed) return code;

  if (lang === 'json' || lang === 'webmanifest') {
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, tabSize);
    } catch {
      return code;
    }
  }

  if (['html', 'xml', 'svg'].includes(lang)) {
    return formatHtml(trimmed, tabSize);
  }

  if (lang === 'sql') {
    return formatSql(trimmed);
  }

  if (
    [
      'javascript',
      'typescript',
      'js',
      'ts',
      'jsx',
      'tsx',
      'c',
      'cpp',
      'c++',
      'csharp',
      'cs',
      'c#',
      'java',
      'go',
      'rust',
      'rs',
      'php',
      'css',
      'scss',
      'less',
    ].includes(lang)
  ) {
    return formatCStyle(code, tabSize);
  }

  return formatGeneric(code);
}

function formatHtml(html: string, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize);
  const tokens = html.replace(/>\s*</g, '><').match(/(<[^>]+>|[^<]+)/g) || [];
  const lines: string[] = [];
  let depth = 0;

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      lines.push(`${indentStr.repeat(depth)}${trimmed}`);
    } else if (trimmed.startsWith('<') && trimmed.endsWith('/>')) {
      lines.push(`${indentStr.repeat(depth)}${trimmed}`);
    } else if (trimmed.startsWith('<') && !trimmed.startsWith('<!') && !trimmed.startsWith('<?')) {
      lines.push(`${indentStr.repeat(depth)}${trimmed}`);
      const isVoid = /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)/i.test(trimmed);
      if (!isVoid) {
        depth++;
      }
    } else {
      lines.push(`${indentStr.repeat(depth)}${trimmed}`);
    }
  }

  return lines.join('\n');
}

function formatSql(sql: string): string {
  const keywords = [
    'SELECT',
    'FROM',
    'WHERE',
    'AND',
    'OR',
    'INSERT INTO',
    'VALUES',
    'UPDATE',
    'SET',
    'DELETE FROM',
    'LEFT JOIN',
    'RIGHT JOIN',
    'INNER JOIN',
    'OUTER JOIN',
    'JOIN',
    'GROUP BY',
    'ORDER BY',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'UNION ALL',
    'UNION',
    'CREATE TABLE',
    'DROP TABLE',
    'ALTER TABLE',
  ];

  let formatted = sql.replace(/\s+/g, ' ').trim();
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    formatted = formatted.replace(regex, kw);
  }

  const newlineKeywords = [
    'SELECT',
    'FROM',
    'WHERE',
    'AND',
    'OR',
    'LEFT JOIN',
    'RIGHT JOIN',
    'INNER JOIN',
    'OUTER JOIN',
    'JOIN',
    'GROUP BY',
    'ORDER BY',
    'HAVING',
    'LIMIT',
    'SET',
    'VALUES',
  ];

  for (const kw of newlineKeywords) {
    const regex = new RegExp(`\\s+(${kw})\\b`, 'g');
    formatted = formatted.replace(regex, '\n$1');
  }

  return formatted.trim();
}

function formatCStyle(code: string, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize);
  const rawLines = code.split(/\r?\n/);
  const normalizedLines: string[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== '') {
        normalizedLines.push('');
      }
      continue;
    }

    const separated = splitCorruptedStatements(trimmed);
    for (const s of separated) {
      if (s.trim()) {
        normalizedLines.push(s.trim());
      }
    }
  }

  const result: string[] = [];
  let depth = 0;

  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i]!;
    if (line === '') {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      continue;
    }

    let openCount = 0;
    let closeCount = 0;
    let inString: string | null = null;
    let escaped = false;

    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const ch = line[charIndex]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (inString) {
        if (ch === inString) {
          inString = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }
      if (ch === '/' && line[charIndex + 1] === '/') {
        break;
      }

      if (ch === '{') openCount++;
      else if (ch === '}') closeCount++;
    }

    const startsWithClose = line.startsWith('}') || line.startsWith(']') || line.startsWith(')');
    const currentIndent = startsWithClose ? Math.max(0, depth - 1) : depth;

    result.push(`${indentStr.repeat(currentIndent)}${line}`);

    depth = Math.max(0, depth + openCount - closeCount);
  }

  return result.join('\n');
}

function splitCorruptedStatements(line: string): string[] {
  const result: string[] = [];
  let inString: string | null = null;
  let escaped = false;
  let current = '';
  let parenDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }

    if (inString) {
      current += ch;
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      current += ch;
      inString = ch;
      continue;
    }

    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (parenDepth === 0) {
      const rest = line.slice(i);
      const boundaryMatch = /^\s+(return\b|const\b|let\b|var\b|function\b|class\b|if\b|else\b|throw\b|export\b|import\b)/.exec(
        rest,
      );

      if (boundaryMatch && current.trim().length > 0) {
        const lastChar = current.trim().slice(-1);
        if (lastChar !== ';' && lastChar !== '{' && lastChar !== '}' && lastChar !== '=' && lastChar !== ':') {
          result.push(current.trim());
          current = '';
          i += boundaryMatch[0].length - boundaryMatch[1]!.length - 1;
          continue;
        }
      }

      const inlineStatementMatch = /^\s+([a-zA-Z_$][a-zA-Z0-9_$]*\s*(?:\+=|-=|\*=|\/=|%=|=)\s*)/.exec(rest);
      if (inlineStatementMatch && current.trim().length > 0) {
        const lastChar = current.trim().slice(-1);
        if (
          lastChar !== ';' &&
          lastChar !== '{' &&
          lastChar !== '}' &&
          lastChar !== '=' &&
          lastChar !== ':' &&
          lastChar !== ',' &&
          lastChar !== '(' &&
          lastChar !== '['
        ) {
          result.push(current.trim());
          current = '';
          i += inlineStatementMatch[0].length - inlineStatementMatch[1]!.length - 1;
          continue;
        }
      }
    }

    current += ch;
  }

  if (current.trim().length > 0) {
    result.push(current.trim());
  }

  return result.length > 0 ? result : [line];
}

function formatGeneric(code: string): string {
  const lines = code.split(/\r?\n/).map((l) => l.trimEnd());
  const output: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (output.length > 0 && output[output.length - 1] !== '') {
        output.push('');
      }
    } else {
      output.push(line);
    }
  }
  return output.join('\n');
}
