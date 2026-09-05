const CStyleLanguages = new Set([
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
]);

const SQL_KEYWORDS = [
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

const SQL_NEWLINE_KEYWORDS = [
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

  if (CStyleLanguages.has(lang)) {
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
      continue;
    }

    if (trimmed.startsWith('<') && trimmed.endsWith('/>')) {
      lines.push(`${indentStr.repeat(depth)}${trimmed}`);
      continue;
    }

    if (trimmed.startsWith('<') && !trimmed.startsWith('<!') && !trimmed.startsWith('<?')) {
      lines.push(`${indentStr.repeat(depth)}${trimmed}`);
      const isVoid = /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)/i.test(trimmed);
      if (!isVoid) {
        depth++;
      }
      continue;
    }

    lines.push(`${indentStr.repeat(depth)}${trimmed}`);
  }

  return lines.join('\n');
}

function formatSql(sql: string): string {
  let formatted = sql.replace(/\s+/g, ' ').trim();
  for (const kw of SQL_KEYWORDS) {
    const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    formatted = formatted.replace(regex, kw);
  }

  for (const kw of SQL_NEWLINE_KEYWORDS) {
    const regex = new RegExp(`\\s+(${kw})\\b`, 'g');
    formatted = formatted.replace(regex, '\n$1');
  }

  return formatted.trim();
}

function countBraceBalance(line: string): { open: number; close: number } {
  let openCount = 0;
  let closeCount = 0;
  let inString: string | null = null;
  let isEscaped = false;

  for (let charIndex = 0; charIndex < line.length; charIndex++) {
    const ch = line[charIndex]!;
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (ch === '\\') {
      isEscaped = true;
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
  return { open: openCount, close: closeCount };
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

    const counts = countBraceBalance(line);
    const startsWithClose = line.startsWith('}') || line.startsWith(']') || line.startsWith(')');
    const currentIndent = startsWithClose ? Math.max(0, depth - 1) : depth;

    result.push(`${indentStr.repeat(currentIndent)}${line}`);

    depth = Math.max(0, depth + counts.open - counts.close);
  }

  return result.join('\n');
}

function splitAtBoundary(rest: string, current: string): { split: boolean; advance: number } {
  const boundaryMatch = /^\s+(return\b|const\b|let\b|var\b|function\b|class\b|if\b|else\b|throw\b|export\b|import\b)/.exec(
    rest,
  );

  if (boundaryMatch && current.trim().length > 0) {
    const lastChar = current.trim().slice(-1);
    if (lastChar !== ';' && lastChar !== '{' && lastChar !== '}' && lastChar !== '=' && lastChar !== ':') {
      return { split: true, advance: boundaryMatch[0].length - boundaryMatch[1]!.length - 1 };
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
      return { split: true, advance: inlineStatementMatch[0].length - inlineStatementMatch[1]!.length - 1 };
    }
  }

  return { split: false, advance: 0 };
}

function scanChar(line: string, i: number, inString: string | null, isEscaped: boolean): {
  ch: string;
  inString: string | null;
  isEscaped: boolean;
  structural: boolean;
} {
  const ch = line[i]!;
  if (isEscaped) return { ch, inString, isEscaped: false, structural: false };
  if (ch === '\\') return { ch, inString, isEscaped: true, structural: false };
  if (inString) {
    return { ch, inString: ch === inString ? null : inString, isEscaped: false, structural: false };
  }
  if (ch === '"' || ch === "'" || ch === '`') return { ch, inString: ch, isEscaped: false, structural: false };
  return { ch, inString: null, isEscaped: false, structural: true };
}

function splitCorruptedStatements(line: string): string[] {
  const result: string[] = [];
  let inString: string | null = null;
  let isEscaped = false;
  let current = '';
  let parenDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const scanned = scanChar(line, i, inString, isEscaped);
    inString = scanned.inString;
    isEscaped = scanned.isEscaped;

    if (scanned.structural) {
      if (scanned.ch === '(') parenDepth++;
      if (scanned.ch === ')') parenDepth = Math.max(0, parenDepth - 1);

      const split = parenDepth === 0 ? splitAtBoundary(line.slice(i), current) : null;
      if (split?.split) {
        result.push(current.trim());
        current = '';
        i += split.advance;
        continue;
      }
    }

    current += scanned.ch;
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