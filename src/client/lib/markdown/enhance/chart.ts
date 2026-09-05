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
        const loading = withTimeout(import('chart.js/auto'), CHART_LOAD_TIMEOUT_MS, t("markdown.diagram_rendering_timed_out_while_loading"));
        chartJsPromise = loading;
        void loading.catch((err) => {
            if (chartJsPromise === loading)
                chartJsPromise = null;
            console.warn(t("markdown.chart_rendering_failed"), err);
        });
    }
    return chartJsPromise;
}

export function destroyChartInstances(root: HTMLElement | null): void {
    root?.querySelectorAll<HTMLElement>('[data-chart]').forEach((node) => {
        const existing = (node as unknown as { __chartInstance?: { destroy: () => void } }).__chartInstance;
        if (existing && typeof existing.destroy === 'function') {
            existing.destroy();
            delete (node as unknown as { __chartInstance?: unknown }).__chartInstance;
        }
    });
}

function parseChartConfig(raw: string): Record<string, unknown> {
    try {
        return JSON.parse(raw);
    }
    catch (initialErr) {
        try {
            const cleaned = raw
                .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
                .replace(/,\s*([\]}])/g, '$1')
                .replace(/\*\*/g, '');
            return JSON.parse(cleaned);
        }
        catch {
            throw initialErr;
        }
    }
}

export async function renderChartJs(root: HTMLElement, dark: boolean): Promise<void> {
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-chart]')];
    if (!nodes.length)
        return;
    for (const node of nodes) {
        const raw = decodeDataValue(node.dataset.chart);
        const signature = `${dark ? 'd' : 'l'}:${raw.length}:${shortHash(raw)}`;
        if (node.dataset.rendered === signature)
            continue;
        let config: Record<string, unknown>;
        try {
            config = parseChartConfig(raw);
        }
        catch (err: unknown) {
            node.classList.remove('loading');
            node.classList.add('has-error', 'chart-error');
            node.removeAttribute('aria-busy');
            const message = errorMessage(err);
            node.innerHTML = `<div class="chart-error-banner"><span class="chart-error-text">${escapeHtml(t("markdown.chart_rendering_failed"))}: ${escapeHtml(message)}</span></div><pre><code>${escapeHtml(raw)}</code></pre>`;
            node.dataset.rendered = signature;
            continue;
        }
        try {
            const chartModule = await getChartJs();
            const Chart = chartModule.Chart ?? (chartModule as unknown as { default: typeof chartModule.Chart }).default;
            if (!root.contains(node))
                return;
            const existing = (node as unknown as { __chartInstance?: { destroy: () => void } }).__chartInstance;
            if (existing && typeof existing.destroy === 'function') {
                existing.destroy();
                delete (node as unknown as { __chartInstance?: unknown }).__chartInstance;
            }
            node.classList.remove('loading', 'has-error', 'chart-error');
            node.removeAttribute('aria-busy');
            node.replaceChildren();
            const container = document.createElement('div');
            container.className = 'chartjs-container';
            const canvas = document.createElement('canvas');
            canvas.className = 'chartjs-canvas';
            container.appendChild(canvas);
            node.appendChild(container);

            const textColor = CHARTJS_TEXT_COLORS[dark ? 'dark' : 'light'];
            const gridColor = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';
            const userOptions = (config.options && typeof config.options === 'object' ? config.options : {}) as Record<string, unknown>;
            const userScales = (userOptions.scales && typeof userOptions.scales === 'object' ? userOptions.scales : {}) as Record<string, unknown>;
            const userPlugins = (userOptions.plugins && typeof userOptions.plugins === 'object' ? userOptions.plugins : {}) as Record<string, unknown>;

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

            const chartConfig = {
                ...config,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    color: textColor,
                    ...userOptions,
                    scales: Object.keys(scales).length > 0 ? scales : undefined,
                    plugins: {
                        legend: {
                            labels: {
                                color: textColor,
                            },
                        },
                        ...userPlugins,
                    },
                },
            };

            const instance = new Chart(canvas, chartConfig as never);
            (node as unknown as { __chartInstance?: unknown }).__chartInstance = instance;
            node.dataset.rendered = signature;
        }
        catch (err: unknown) {
            if (!root.contains(node))
                return;
            node.classList.remove('loading');
            node.classList.add('has-error', 'chart-error');
            node.removeAttribute('aria-busy');
            const message = errorMessage(err);
            node.innerHTML = `<div class="chart-error-banner"><span class="chart-error-text">${escapeHtml(t("markdown.chart_rendering_failed"))}: ${escapeHtml(message)}</span></div><pre><code>${escapeHtml(raw)}</code></pre>`;
            node.dataset.rendered = signature;
        }
    }
}
