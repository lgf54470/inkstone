import { describe, expect, it } from 'vitest';
import { formatCode } from './code-formatter';

describe('formatCode', () => {
  it('formats JSON with proper indentation', () => {
    const raw = '{"a":1,"b":[2,3],"c":{"d":true}}';
    const formatted = formatCode(raw, 'json');
    expect(formatted).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ],\n  "c": {\n    "d": true\n  }\n}');
  });

  it('formats HTML with proper hierarchy', () => {
    const raw = '<div><p><span>Hello</span></p></div>';
    const formatted = formatCode(raw, 'html');
    expect(formatted).toBe('<div>\n  <p>\n    <span>\n      Hello\n    </span>\n  </p>\n</div>');
  });

  it('formats SQL with uppercase keywords and line breaks', () => {
    const raw = 'select id, name from users where age > 18 order by created_at desc';
    const formatted = formatCode(raw, 'sql');
    expect(formatted).toContain('SELECT id, name');
    expect(formatted).toContain('\nFROM users');
    expect(formatted).toContain('\nWHERE age > 18');
    expect(formatted).toContain('\nORDER BY created_at desc');
  });

  it('formats corrupted single-line JavaScript/TypeScript from paste', () => {
    const compressed = `export function fuzzyMatch(text: string, query: string): FuzzyMatch | null { 
  if (!query) return { score: 0, ranges: [] }
  const haystack = text.toLowerCase() 
  const needle = query.toLowerCase().trim() 
  if (!needle) return { score: 0, ranges: [] }

  const direct = haystack.indexOf(needle) 
  if (direct >= 0) { 
    let score = 1000 - direct * 2 
    if (direct === 0) score += 300 
    else if (isBoundary(haystack, direct)) 
    score += 150 score += Math.max(0, 120 - text.length) return { score, ranges: [[direct, direct + needle.length]] 
  } 
}`;

    const formatted = formatCode(compressed, 'javascript');
    expect(formatted).toContain('score += 150');
    expect(formatted).toContain('score += Math.max(0, 120 - text.length)');
    expect(formatted).toContain('return { score, ranges: [[direct, direct + needle.length]]');
    expect(formatted.includes('score += 150 score += Math.max')).toBe(false);
  });
});
