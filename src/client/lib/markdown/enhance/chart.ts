import { escapeHtml } from '@shared/escape';
import { decodeDataValue } from '../data-attr';
import { errorMessage } from '../../errors';
import { t } from '../../i18n';
import { shortHash, withTimeout } from './util';

const CHARTJS_TEXT_COLORS = { dark: '#94a3b8', light: '#64748b' } as const
let chartJsPromise: Promise<typeof import('chart.js/auto')> | null = null;
const CHART_LOAD_TIMEOUT_MS = 15000;

async function getChartJs(): Promise<typeof import('chart.js/auto')> {
  if (!chartJsPromise) {
    const loading = withTimeout(import('chart.js/auto'), CHART_LOAD_TIMEOUT_MS, t('markdown.diagram_rendering_timed_out_while_loading'));
    chartJsPromise = loading;
    void loading.catch((err) => {
      if (chartJsPromise === loading)
        chartJsPromise = null;
      console.warn(t('markdown.chart_rendering_failed'), err);
    });
  }
  return chartJsPromise;
}

function destroyChartInstance(node: HTMLElement): void {
  const existing = (node as unknown as { __chartInstance?: { destroy: () => void } }).__chartInstance;
  if (existing && typeof existing.destroy === 'function') {
    existing.destroy();
    delete (node as unknown as { __chartInstance?: unknown }).__chartInstance;
  }
}

export function destroyChartInstances(root: HTMLElement | null): void {
  root?.querySelectorAll<HTMLElement>('[data-chart]').forEach((node) => {
    destroyChartInstance(node);
  });
}

// Chart blocks carry tolerate formatting: comment/`**` markers stripped and
// trailing commas allowed before the strict JSON.parse is attempted.
function cleanChartConfig(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/\*\*/g, '');
}

function parseChartConfig(raw: string): Record<string, unknown> {
  let initialErr: unknown = null;
  try {
    return JSON.parse(raw);
  }
  catch (err) {
    initialErr = err;
  }
  try {
    return JSON.parse(cleanChartConfig(raw));
  }
  catch {
    throw initialErr;
  }
}

function markChartError(node: HTMLElement, err: unknown, raw: string, signature: string): void {
  node.classList.remove('loading');
  node.classList.add('has-error', 'chart-error');
  node.removeAttribute('aria-busy');
  const message = errorMessage(err);
  node.innerHTML = `<div class="chart-error-banner"><span class="chart-error-text">${escapeHtml(t('markdown.chart_rendering_failed'))}: ${escapeHtml(message)}</span></div><pre><code>${escapeHtml(raw)}</code></pre>`;
  node.dataset.rendered = signature;
}

function chartThemeColors(dark: boolean): { text: string; grid: string } {
  return {
    text: CHARTJS_TEXT_COLORS[dark ? 'dark' : 'light'],
    grid: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
  };
}

// Re-applies the app's axis colors under the user's own ticks/grid objects.
function themedScales(userScales: Record<string, unknown>, textColor: string, gridColor: string): Record<string, unknown> {
  const scales: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(userScales)) {
    if (val && typeof val === 'object') {
      const scaleObj = val as Record<string, unknown>;
      scales[key] = {
        ...scaleObj,
        ticks: { color: textColor, ...(scaleObj.ticks as object || {}) },
        grid: { color: gridColor, ...(scaleObj.grid as object || {}) },
      };
    }
  }
  return scales;
}

function buildChartConfig(config: Record<string, unknown>, dark: boolean): Record<string, unknown> {
  const { text, grid } = chartThemeColors(dark);
  const userOptions = (config.options && typeof config.options === 'object' ? config.options : {}) as Record<string, unknown>;
  const userScales = (userOptions.scales && typeof userOptions.scales === 'object' ? userOptions.scales : {}) as Record<string, unknown>;
  const userPlugins = (userOptions.plugins && typeof userOptions.plugins === 'object' ? userOptions.plugins : {}) as Record<string, unknown>;
  const scales = themedScales(userScales, text, grid);
  return {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      color: text,
      ...userOptions,
      scales: Object.keys(scales).length > 0 ? scales : undefined,
      plugins: {
        legend: {
          labels: {
            color: text,
          },
        },
        ...userPlugins,
      },
    },
  };
}

// One block: parse the config, then instantiate the chart; both failures land
// on the same error banner. The root-containment check aborts the whole batch
// once the node was detached mid-render (the original behavior).
async function renderChartNode(root: HTMLElement, node: HTMLElement, raw: string, signature: string, dark: boolean): Promise<void> {
  let config: Record<string, unknown>;
  try {
    config = parseChartConfig(raw);
  }
  catch (err: unknown) {
    markChartError(node, err, raw, signature);
    return;
  }
  try {
    const chartModule = await getChartJs();
    const Chart = chartModule.Chart ?? (chartModule as unknown as { default: typeof chartModule.Chart }).default;
    if (!root.contains(node))
      return;
    destroyChartInstance(node);
    node.classList.remove('loading', 'has-error', 'chart-error');
    node.removeAttribute('aria-busy');
    node.replaceChildren();
    const container = document.createElement('div');
    container.className = 'chartjs-container';
    const canvas = document.createElement('canvas');
    canvas.className = 'chartjs-canvas';
    container.appendChild(canvas);
    node.appendChild(container);
    const instance = new Chart(canvas, buildChartConfig(config, dark) as never);
    (node as unknown as { __chartInstance?: unknown }).__chartInstance = instance;
    node.dataset.rendered = signature;
  }
  catch (err: unknown) {
    if (!root.contains(node))
      return;
    markChartError(node, err, raw, signature);
  }
}

export async function renderChartJs(root: HTMLElement, dark: boolean): Promise<void> {
  const nodes = [...root.querySelectorAll<HTMLElement>('[data-chart]')];
  for (const node of nodes) {
    const raw = decodeDataValue(node.dataset.chart);
    const signature = `${dark ? 'd' : 'l'}:${raw.length}:${shortHash(raw)}`;
    if (node.dataset.rendered === signature)
      continue;
    await renderChartNode(root, node, raw, signature, dark);
  }
}
