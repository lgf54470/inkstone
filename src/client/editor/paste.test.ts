import { describe, expect, it } from 'vitest';
import { isInsideCodeBlock } from './paste';

describe('isInsideCodeBlock', () => {
  it('detects when cursor is inside and outside code blocks', () => {
    const lines = [
      'Normal text',
      '```javascript',
      'const x = 1;',
      'const y = 2;',
      '```',
      'More text',
    ];

    const mockDoc = {
      lines: lines.length,
      line: (n: number) => ({ text: lines[n - 1] ?? '', number: n }),
      lineAt: (pos: number) => ({ number: pos }),
    };

    expect(isInsideCodeBlock(mockDoc, 1)).toBe(false);
    expect(isInsideCodeBlock(mockDoc, 2)).toBe(true);
    expect(isInsideCodeBlock(mockDoc, 3)).toBe(true);
    expect(isInsideCodeBlock(mockDoc, 4)).toBe(true);
    expect(isInsideCodeBlock(mockDoc, 6)).toBe(false);
  });
});
