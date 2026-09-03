import { t } from '../../lib/i18n';

export interface JsLogItem {
  type: 'log' | 'info' | 'warn' | 'error';
  text: string;
}

export interface JsExecutionResult {
  logs: JsLogItem[];
  result?: string;
  error?: string;
  durationMs: number;
}

export function formatJsValue(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'symbol' || typeof val === 'bigint') {
    return String(val);
  }
  if (typeof val === 'function') {
    return val.toString();
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}`;
  }
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export function executeJsExample(code: string): JsExecutionResult {
  const logs: JsLogItem[] = [];

  const fakeConsole = {
    log: (...args: unknown[]) => {
      logs.push({ type: 'log', text: args.map(formatJsValue).join(' ') });
    },
    info: (...args: unknown[]) => {
      logs.push({ type: 'info', text: args.map(formatJsValue).join(' ') });
    },
    warn: (...args: unknown[]) => {
      logs.push({ type: 'warn', text: args.map(formatJsValue).join(' ') });
    },
    error: (...args: unknown[]) => {
      logs.push({ type: 'error', text: args.map(formatJsValue).join(' ') });
    },
  };

  const start = performance.now();
  try {
    const fn = new Function('console', `"use strict";\n${code}`);
    const res = fn(fakeConsole);
    const durationMs = Math.round(performance.now() - start);
    let result: string | undefined;
    if (res !== undefined) {
      result = formatJsValue(res);
    }
    return { logs, result, durationMs };
  } catch (err: unknown) {
    if (err instanceof EvalError && typeof document !== 'undefined') {
      const fallback = executeWithScriptElement(code, fakeConsole);
      const durationMs = Math.round(performance.now() - start);
      return { logs, result: fallback.result, error: fallback.error, durationMs };
    }
    const durationMs = Math.round(performance.now() - start);
    const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { logs, error, durationMs };
  }
}

function executeWithScriptElement(
  code: string,
  fakeConsole: Record<string, unknown>,
): { result?: string; error?: string } {
  if (typeof document === 'undefined') {
    return { error: 'Document is not available' };
  }

  const nonce =
    document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ||
    document.querySelector<HTMLScriptElement>('script[nonce]')?.getAttribute('nonce') ||
    '';

  const runId = `__ink_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let capturedResult: string | undefined;
  let capturedError: string | undefined;

  (window as unknown as Record<string, unknown>)[runId] = {
    console: fakeConsole,
    onSuccess: (val: unknown) => {
      if (val !== undefined) capturedResult = formatJsValue(val);
    },
    onError: (err: unknown) => {
      capturedError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    },
  };

  const script = document.createElement('script');
  if (nonce) {
    script.nonce = nonce;
    script.setAttribute('nonce', nonce);
  }
  script.textContent = `(function() {
  "use strict";
  const runner = window['${runId}'];
  if (!runner) return;
  try {
    const res = (function(console) {
      ${code}
    })(runner.console);
    runner.onSuccess(res);
  } catch (err) {
    runner.onError(err);
  }
})();`;

  try {
    document.head.appendChild(script);
  } catch (err) {
    capturedError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    script.remove();
    delete (window as unknown as Record<string, unknown>)[runId];
  }

  return { result: capturedResult, error: capturedError };
}

export function handleJsExampleSwitch(switchBtn: HTMLButtonElement): void {
  const isChecked = switchBtn.classList.contains('is-checked');
  const nextChecked = !isChecked;
  switchBtn.classList.toggle('is-checked', nextChecked);
  switchBtn.setAttribute('aria-checked', String(nextChecked));

  const block = switchBtn.closest<HTMLElement>('.js-example-block');
  const codeBlock = block?.querySelector<HTMLElement>('.code-block');
  if (codeBlock) {
    codeBlock.classList.toggle('has-line-numbers', nextChecked);
    codeBlock.dataset.lineNumbers = String(nextChecked);
  }
}

export function handleJsExampleRun(runBtn: HTMLButtonElement): void {
  const block = runBtn.closest<HTMLElement>('.js-example-block');
  if (!block) return;

  const codeEl = block.querySelector<HTMLElement>('.code-block pre code');
  const outputBody = block.querySelector<HTMLElement>('.js-example-output-body');
  const statusEl = block.querySelector<HTMLElement>('.js-example-output-status');
  if (!codeEl || !outputBody) return;

  const code = codeEl.textContent ?? '';
  const { logs, result, error, durationMs } = executeJsExample(code);

  if (statusEl) {
    if (error) {
      statusEl.className = 'js-example-output-status is-error';
      statusEl.textContent = `✕ ${durationMs}ms`;
    } else {
      statusEl.className = 'js-example-output-status is-success';
      statusEl.textContent = `✓ ${durationMs}ms`;
    }
  }

  outputBody.innerHTML = '';

  if (logs.length === 0 && result === undefined && !error) {
    const emptyRow = document.createElement('div');
    emptyRow.className = 'js-example-empty-hint';
    emptyRow.textContent = t('workspace.executed_no_output');
    outputBody.appendChild(emptyRow);
    return;
  }

  logs.forEach((item) => {
    const row = document.createElement('div');
    row.className = `js-example-log-row is-${item.type}`;
    const prefix = document.createElement('span');
    prefix.className = 'js-example-log-prefix';
    prefix.textContent = item.type === 'error' ? '✖' : item.type === 'warn' ? '▲' : '›';
    const text = document.createElement('pre');
    text.className = 'js-example-log-text';
    text.textContent = item.text;
    row.appendChild(prefix);
    row.appendChild(text);
    outputBody.appendChild(row);
  });

  if (result !== undefined) {
    const resRow = document.createElement('div');
    resRow.className = 'js-example-log-row is-return';
    const prefix = document.createElement('span');
    prefix.className = 'js-example-log-prefix';
    prefix.textContent = '←';
    const text = document.createElement('pre');
    text.className = 'js-example-log-text';
    text.textContent = result;
    resRow.appendChild(prefix);
    resRow.appendChild(text);
    outputBody.appendChild(resRow);
  }

  if (error) {
    const errRow = document.createElement('div');
    errRow.className = 'js-example-log-row is-error-banner';
    const prefix = document.createElement('span');
    prefix.className = 'js-example-log-prefix';
    prefix.textContent = '✖';
    const text = document.createElement('pre');
    text.className = 'js-example-log-text';
    text.textContent = error;
    errRow.appendChild(prefix);
    errRow.appendChild(text);
    outputBody.appendChild(errRow);
  }
}
