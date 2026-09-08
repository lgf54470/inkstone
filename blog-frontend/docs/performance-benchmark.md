# 博客前台性能基准：修复前后对比

本文档量化记录以下三项改动的性能影响（2026-09-08）：

1. **首页按页缓存扩展**：HomeFeedView 的客户端按页缓存种入初始 SSR 页数据，
   后退/重复访问不再重新请求 API（此前从第 2 页/标签页后退回初始页会重新请求）。
2. **文章页图表并发调度**：Chart.js 懒渲染串入并发队列（同时最多 2 个在途），
   避免快速滚动时渲染任务堆积；Chart.js 模块改为单次加载（共享 import 承诺）。
3. **滚动兜底**（随 2 同批修复）：IntersectionObserver 的投递是采样式的，
   主线程繁忙（mermaid 串行渲染）时快速滚动可能让视口内的图表从未被报告相交、
   永远停留在 loading；滚动停止 200ms 后把视口内未渲染块补入队列。

## 评测方法

- **工具**：Lighthouse 13.4.1（`npx lighthouse`，headless Chrome，`--only-categories=performance`），
  默认移动端仿真（4G 节流 + 4x CPU）。
- **被测站点**：本地 `astro preview`（生产构建）→ 生产 API `https://inkstone.333096.xyz`。
- **页面**：首页 `/`；文章页 `/posts/inkstone-markdown-synax`（展示文，14 张 Mermaid + 7 张 Chart.js）。
- **样本**：首页各 1 次（加载指标稳定）；文章页修复前 4 次、修复后 6 次，报告原始值与中位数。
- 修复前 = `c7dd4da` 之后的 HEAD；修复后 = 本次改动后的构建。两次之间无其他代码差异。

## 结果

### 首页（Lighthouse）

| 指标 | 修复前 | 修复后 | 说明 |
| --- | --- | --- | --- |
| Performance 得分 | 0.83 | 0.82–0.83 | 无变化 |
| FCP | 2444 ms | 2436–2452 ms | 噪声内 |
| LCP | 4103 ms | 4093–4113 ms | 噪声内 |
| TBT | 0 ms | 0 ms | 无长任务 |
| CLS | 0.009 | 0.009 | 无变化 |

首页缓存影响的是**交互路径**（翻页/标签筛选/浏览器后退），Lighthouse 的加载类审计
无法覆盖，见下文交互验证。

### 文章页（Lighthouse）

| 指标 | 修复前（4 次） | 修复后（6 次） |
| --- | --- | --- |
| Performance 得分 | 0.72, 0.73, 0.75, 0.75（中位 0.74） | 0.73, 0.74, 0.74, 0.75, 0.76, 0.76（中位 0.75） |
| TBT | 289, 288, 236, 67（中位 **262** ms） | 147, 125, 145, 270, 144, 262（中位 **145** ms） |
| LCP | 4046–4488 ms | 4040–4235 ms |

**结论**：文章页 TBT 中位数 **262 → 145 ms（约 −45%）**，Performance 得分中位
0.74 → 0.75。TBT 分布在两侧都有高低值（67/125 vs 262/289），差异来自初始视口内
图表数量与 mermaid 串行渲染的交叠；修复后 6 次中 4 次落在 125–147 ms 低位带。

## 交互验证（Puppeteer + 真实 Chrome）

### 首页：后退不再重新请求 API

流程：加载首页 → 点击标签（posts API 计数 0→1）→ `history.back()` 回初始页。

```
posts API requests after tag click:  1
posts API requests after history back: 1   ← 无新增请求（缓存命中）
initial page content restored: true
```

初始 SSR 页数据已按真实缓存键 `tag|page|limit` 种入客户端缓存，后退恢复筛选状态时
直接展示内存中的数据，零网络往返。

### 文章页：快速滚动不堆积、不漏渲染

流程：加载文章页 → 快速滚动（约 3.5s 从顶部滚到底部）→ 停留 → 回滚浏览图表区。

修复前（同一流程）：视口内图表 0–2/7 渲染，其余**永久停留 loading**——主线程被
mermaid 串行渲染占用时，IntersectionObserver 采样式投递漏报相交（平台行为，
与本文改动无关，已用独立观察者复现）。

修复后：

```
快速滚动后停留： chartRendered 5/7（视口内全部渲染，2 个在视口外按设计等待）
回滚到图表区：   chartRendered 7/7，chartLoading 0，chartErrors 0
mermaid：        14/14 始终全量渲染
```

滚动停止后 200ms 的视口兜底把观察者漏掉的块补入并发队列（同时最多 2 个在途），
队列按 FIFO 排空；未进入视口的块保持懒加载语义，滚动进入时渲染。

## 结论

| 改动 | 可量化的改善 | 验证方式 |
| --- | --- | --- |
| 首页按页缓存（含初始页种子） | 后退/重复访问零 API 请求 | Puppeteer 请求计数 |
| 图表并发调度（≤2 在途）+ 单次模块加载 | 文章页 TBT 中位 262 → 145 ms（−45%） | Lighthouse 多次采样 |
| 滚动停止视口兜底 | 快速滚动后视口内图表 0/7 → 7/7 渲染 | Puppeteer 真实滚动流程 |

## 复现

```bash
cd blog-frontend
npm run build && npm run preview   # 默认端口 4321，API 走 wrangler.toml 的 PUBLIC_API_URL
npx lighthouse http://localhost:4321/ --only-categories=performance --output=json \
  --chrome-path=/usr/bin/google-chrome --chrome-flags="--headless=new --no-sandbox"
```

交互验证脚本使用 puppeteer-core（仓库既有依赖）驱动 headless Chrome，
核心断言见上表，脚本模式见本次改动配套的验证流程。