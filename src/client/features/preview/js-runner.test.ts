import { describe, expect, it } from 'vitest';
import { executeJsExample, formatJsValue } from './js-runner';

describe('js-runner executeJsExample', () => {
  it('captures console.log output with primitive values and objects', () => {
    const code = `
      console.log("Hello", 42, true);
      console.log({ a: 1, b: "test" });
    `;
    const res = executeJsExample(code);
    expect(res.error).toBeUndefined();
    expect(res.logs).toHaveLength(2);
    expect(res.logs[0]!.type).toBe('log');
    expect(res.logs[0]!.text).toBe('Hello 42 true');
    expect(res.logs[1]!.text).toContain('"a": 1');
  });

  it('captures console.warn and console.error', () => {
    const code = `
      console.warn("Warning msg");
      console.error("Error msg");
    `;
    const res = executeJsExample(code);
    expect(res.logs).toHaveLength(2);
    expect(res.logs[0]!.type).toBe('warn');
    expect(res.logs[0]!.text).toBe('Warning msg');
    expect(res.logs[1]!.type).toBe('error');
    expect(res.logs[1]!.text).toBe('Error msg');
  });

  it('captures returned values', () => {
    const code = `
      const x = 10;
      const y = 20;
      return x + y;
    `;
    const res = executeJsExample(code);
    expect(res.error).toBeUndefined();
    expect(res.result).toBe('30');
  });

  it('captures runtime exceptions gracefully', () => {
    const code = `
      const obj = null;
      obj.someMethod();
    `;
    const res = executeJsExample(code);
    expect(res.error).toBeDefined();
    expect(res.error).toContain('TypeError');
  });

  it('handles circular references in formatJsValue', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatJsValue(circular)).toBe('[object Object]');
  });
});
