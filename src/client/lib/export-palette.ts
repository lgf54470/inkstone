// Palette of the self-contained HTML export (export-note.ts EXPORT_CSS). The
// exported file is a standalone document that must render without the app's
// stylesheets, so it cannot consume runtime CSS variables; keeping every
// value in this one table (instead of raw hex inside the CSS template) gives
// the export palette a single source of truth, and export-palette.test.ts
// fails on any hex that is not in this table or any entry left unused.
export const EXPORT_PALETTE = {
  white: '#ffffff',
  ink50: '#f8fafc',
  ink100: '#f1f5f9',
  ink200: '#e2e8f0',
  ink300: '#cbd5e1',
  ink400: '#94a3b8',
  ink500: '#64748b',
  ink600: '#475569',
  ink700: '#334155',
  ink800: '#1e293b',
  ink900: '#0f172a',
  blue50: '#eff6ff',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  sky100: '#e0f2fe',
  sky400: '#38bdf8',
  sky700: '#0284c7',
  emerald50: '#ecfdf5',
  emerald500: '#10b981',
  amber50: '#fffbeb',
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  yellow200: '#fef08a',
  red50: '#fef2f2',
  red500: '#ef4444',
  rose500: '#f43f5e',
  violet50: '#f5f3ff',
  violet500: '#8b5cf6',
  indigo400: '#818cf8',
  orange500: '#f97316',
  whiteOverlay5: 'rgba(255, 255, 255, 0.05)',
  whiteOverlay8: 'rgba(255, 255, 255, 0.08)',
} as const

export type ExportPaletteKey = keyof typeof EXPORT_PALETTE