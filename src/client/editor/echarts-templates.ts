/**
 * The templates the insert menu offers for a ```echarts fence.
 *
 * An echarts body names no colours: the block paints its series with the account's accent ramp unless
 * the note colours them itself, which is the difference between a chart that came out of a
 * documentation page and one the author styled on purpose. The last two bodies are Cherry's table form,
 * which is the same data written where a person can edit it in place.
 */
import type { DiagramTemplate } from './diagram-templates'

/**
 * An echarts body names no colours: the block paints its series with the account's accent ramp unless
 * the note colours them itself, which is the difference between a chart that came from a documentation
 * page and one the author styled on purpose.
 */
export const ECHARTS_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'bar',
    labelKey: 'contextmenu.echarts_bar',
    code: `{
  title: { text: 'Monthly Revenue' },
  xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
  yAxis: { type: 'value' },
  series: [{ name: 'Revenue ($k)', type: 'bar', data: [12, 19, 15, 25, 22, 30] }],
}`,
  },
  {
    id: 'line',
    labelKey: 'contextmenu.echarts_line',
    code: `{
  title: { text: 'Active Users' },
  xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  yAxis: { type: 'value' },
  series: [
    { name: 'Returning', type: 'line', smooth: true, data: [1200, 1900, 1700, 2100, 2400, 2800, 3100] },
    { name: 'New', type: 'line', smooth: true, data: [400, 620, 540, 780, 900, 1100, 1250] },
  ],
}`,
  },
  {
    id: 'pie',
    labelKey: 'contextmenu.echarts_pie',
    code: `{
  title: { text: 'Traffic Sources' },
  series: [{
    name: 'Source',
    type: 'pie',
    radius: '62%',
    data: [
      { name: 'Direct', value: 35 },
      { name: 'Search', value: 40 },
      { name: 'Social', value: 15 },
      { name: 'Referral', value: 10 },
    ],
  }],
}`,
  },
  {
    id: 'table',
    labelKey: 'contextmenu.echarts_table',
    code: `| :bar:{"title": "Quarterly Result"} | Q1 | Q2 | Q3 | Q4 |
| --- | --- | --- | --- | --- |
| Revenue ($k) | 12 | 19 | 15 | 25 |
| Cost ($k) | 8 | 11 | 9 | 14 |`,
  },
  {
    id: 'map',
    labelKey: 'contextmenu.echarts_map',
    // The outlines come from the app's own map route, so a reader needs no setting turned on to see the
    // picture; `mapDataSource` is only for a note that names another allowed region file.
    code: `| :map: | 地区 | 值 |
| --- | --- | --- |
| 北京 | 100 |
| 上海 | 88 |
| 广东 | 72 |
| 浙江 | 61 |`,
  },
]
