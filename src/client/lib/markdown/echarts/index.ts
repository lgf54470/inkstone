export {
  ECHARTS_LANGUAGES,
  ECHARTS_SCRIPT_KEY,
  applyEchartsFencePatch,
  detectEchartsMode,
  echartsFenceAt,
  readsFenceScript,
  withFenceScript,
  type EchartsFence,
  type EchartsMode,
} from './body'
export { EchartsOptionError, parseEchartsOption, type EchartsOptionReason } from './option'
export { loadEcharts } from './loader'
export { MAP_SERIES_NAME, loadMapGeometry } from './map'
export { EchartsTableError, ECHARTS_TABLE_KINDS, tableToEchartsOption, echartsOptionToTable, type EchartsTableReason, type EchartsTableOption } from './table-option'
export { convertEchartsBody, readEchartsBody, type EchartsConversion, type EchartsConvertFailure } from './read'
export { echartsTheme } from './theme'
// The chart handle is a type only: re-exporting `./vendor` as a value would pull the library into
// every chunk that imports this index, which is the boundary ./loader exists to hold.
export type { EchartsChart } from './vendor'
